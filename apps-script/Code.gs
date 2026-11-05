/**
 * Central Issues Escalation — Sheet ↔ Supabase sync
 *
 * OPS staff work in the ZONE tabs: ISD, SUB, OSD, CTG, Central sort, TNL.
 * Each zone tab shows only that zone's escalated issues (same 14 columns as
 * the master "Escalated Issues" tab, which is hidden and kept as the KAM view).
 *
 * How it works:
 *   • onEdit()     — in ANY zone tab (or the master tab), editing Status (J),
 *                    Ops Remark 1 (K) or Ops Remark 2 (M) is written back to
 *                    Supabase instantly + auto-timestamps the "At" columns.
 *                    - Editing Status (J) syncs both OPS status and KAM status.
 *                    - Editing Ops Remark 1 (K) auto-sets both OPS and KAM
 *                      status to "In Progress" (1st remarks hit → In Progress).
 *                    - Editing Ops Remark 2 (M) saves the remark only — KAM
 *                      decides the final status (Resolved / Not Remarks / Improper).
 *   • syncZones()  — reconciles all 6 zone tabs with Supabase: new issues are
 *                    appended to their zone tab, existing rows updated, rows
 *                    removed from Supabase are cleared. Runs every 5 minutes.
 *   • syncIssues() — appends new issues to the hidden master tab (every 5 min).
 *
 * Sheet layout (all tabs):
 *   A Reference No | B KAM | C Zone | D Hub | E Category | F Subcategory
 *   G Priority | H Parcel ID | I Description | J Status | K Ops Remark 1
 *   L Remark 1 At | M Ops Remark 2 | N Remark 2 At
 *
 * Columns A–I are the locked KAM part (protected range in every tab).
 * Columns J–N are the OPS part: OPS staff edit remarks & dropdowns here,
 * and every edit is written back to Supabase automatically.
 *
 * Setup:
 *   1. Replace SUPABASE_SERVICE_KEY below with the Supabase service-role key.
 *   2. Paste this file into the sheet's Apps Script editor (Script Editor →
 *      delete old code → paste → save). Reload the spreadsheet once —
 *      onOpen() auto-installs the 5-minute triggers.
 *   3. Or run syncZones() manually from the 🔄 Issue Sync menu.
 */

var SUPABASE_URL = "https://eszrbptehtztbzrlvlzi.supabase.co";
var SUPABASE_SERVICE_KEY = "YOUR_SUPABASE_SERVICE_ROLE_KEY";
var MASTER_SHEET_NAME = "Escalated Issues";
var ZONE_SHEETS = ["ISD", "SUB", "OSD", "CTG", "Central sort", "TNL"];
var SYNC_SHEETS = [MASTER_SHEET_NAME].concat(ZONE_SHEETS);

/** Column indexes (1-based) for the OPS part of the sheet. */
var COL_STATUS = 10;      // J
var COL_REMARK1 = 11;     // K
var COL_REMARK1_AT = 12;  // L
var COL_REMARK2 = 13;     // M
var COL_REMARK2_AT = 14;  // N

var HEADERS = [
  "Reference No",
  "KAM",
  "Zone",
  "Hub",
  "Category",
  "Subcategory",
  "Priority",
  "Parcel ID",
  "Description",
  "Status",
  "Ops Remark 1",
  "Remark 1 At",
  "Ops Remark 2",
  "Remark 2 At",
];

/** Maps KAM status to OPS status. Not all KAM statuses have OPS equivalents. */
function mapKamStatusToOps(kamStatus) {
  var map = {
    "Open": "Open",
    "In Progress": "In Progress",
    "Resolved": "Solved",
    "Not Remarks": "Open",
    "Improper": "Open",
    "Solved": "Solved",
    "Closed": "Open",
    "Re-opened": "Open",
  };
  return map[kamStatus] || "Open";
}

function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MASTER_SHEET_NAME);
}

/* ------------------------------------------------------------------ *
 *  On edit — write OPS changes back to Supabase + auto-timestamp     *
 *  (fires in ANY zone tab or the master tab)                         *
 * ------------------------------------------------------------------ */

function onEdit(e) {
  var sheet = e.range.getSheet();
  if (SYNC_SHEETS.indexOf(sheet.getName()) === -1) return;

  var range = e.range;
  var row = range.getRow();
  var column = range.getColumn();
  if (row <= 1) return; // header row

  var referenceNo = getCell(sheet, row, 1);
  if (!referenceNo) return;

  var updates = {};

  if (column === COL_STATUS) {
    // Dropdown selected (or cleared) → set KAM status + mapped OPS status.
    var v = String(range.getValue() || "").trim();
    var st = v === "" ? "Open" : v; // before any selection it is Open
    updates.status = st;
    updates.ops_status = mapKamStatusToOps(st);
    updates.ops_status_at = new Date().toISOString();
  } else if (column === COL_REMARK1) {
    // Ops Remark 1 edited → save remark + auto-fill timestamp in L.
    // ALSO: auto-set both OPS status and KAM status to "In Progress"
    // (1st remarks hit → goes to In Progress automatically for both).
    updates.ops_remark1 = range.getValue() || null;
    updates.ops_remark1_at = new Date().toISOString();
    updates.ops_status = "In Progress";
    updates.status = "In Progress";
    updates.ops_status_at = new Date().toISOString();
    setCell(sheet, row, COL_REMARK1_AT, new Date());
    // Also update the Status cell (J) to show "In Progress"
    setCell(sheet, row, COL_STATUS, "In Progress");
  } else if (column === COL_REMARK2) {
    // Ops Remark 2 edited → save remark + auto-fill timestamp in N.
    // No auto status change — KAM decides the status after 2nd remarks.
    updates.ops_remark2 = range.getValue() || null;
    updates.ops_remark2_at = new Date().toISOString();
    setCell(sheet, row, COL_REMARK2_AT, new Date());
  } else {
    return; // KAM columns are locked; ignore other edits
  }

  updateIssue(referenceNo, updates);
}

function getCell(sheet, row, col) {
  var v = sheet.getRange(row, col).getValue();
  return v === null || v === "" ? "" : String(v).trim();
}

function setCell(sheet, row, col, value) {
  sheet.getRange(row, col).setValue(value);
}

/** PATCH an issue by reference_no via the Supabase REST API.
 *  Returns true when Supabase accepted the update. */
function updateIssue(referenceNo, updates) {
  var url =
    SUPABASE_URL +
    "/rest/v1/issues?reference_no=eq." +
    encodeURIComponent(referenceNo);
  var options = {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: "Bearer " + SUPABASE_SERVICE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    contentType: "application/json",
    payload: JSON.stringify(updates),
  };
  try {
    var res = UrlFetchApp.fetch(url, options);
    var code = res.getResponseCode();
    if (code !== 200) {
      Logger.log(
        "[updateIssue] HTTP " + code + " for " + referenceNo + ": " +
        res.getContentText()
      );
      return false;
    }
    Logger.log("[updateIssue] Updated " + referenceNo);
    return true;
  } catch (err) {
    Logger.log("[updateIssue] Error for " + referenceNo + ": " + err);
    return false;
  }
}

/* ------------------------------------------------------------------ *
 *  syncZones — reconcile all 6 zone tabs with Supabase                *
 *  (time-driven, every 5 minutes)                                    *
 * ------------------------------------------------------------------ */

function syncZones() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var issues = fetchIssues();
  if (!issues) return;
  var kamEmail = fetchKamEmails();

  // Group issues by zone (case-insensitive zone match).
  var issuesByZone = {};
  ZONE_SHEETS.forEach(function (z) { issuesByZone[z] = []; });
  issues.forEach(function (issue) {
    var z = String(issue.zone || "").trim();
    var matched = null;
    ZONE_SHEETS.forEach(function (zn) {
      if (matched === null && z.toLowerCase() === zn.toLowerCase()) matched = zn;
    });
    if (matched) issuesByZone[matched].push(issue);
  });

  var totalAdded = 0, totalUpdated = 0, totalCleared = 0;

  ZONE_SHEETS.forEach(function (zoneName) {
    var sheet = ss.getSheetByName(zoneName);
    if (!sheet) {
      Logger.log("[syncZones] Zone tab not found: " + zoneName);
      return;
    }

    var byRef = getRefRowMap(sheet);      // ref -> row
    var zoneIssues = issuesByZone[zoneName];
    var inTab = {};
    var updates = [];      // { row, values }
    var toAppend = [];

    zoneIssues.forEach(function (issue) {
      var ref = String(issue.reference_no || "").trim();
      if (!ref) return;
      inTab[ref] = true;
      var row = byRef[ref];
      var values = buildRow(issue, kamEmail);
      if (row) {
        updates.push({ row: row, values: values });
      } else {
        toAppend.push(values);
      }
    });

    // 1) Update existing rows with fresh Supabase data.
    updates.forEach(function (u) {
      sheet.getRange(u.row, 1, 1, HEADERS.length).setValues([u.values]);
      totalUpdated++;
    });

    // 2) Clear rows that no longer exist in Supabase for this zone.
    Object.keys(byRef).forEach(function (ref) {
      if (!inTab[ref]) {
        sheet.getRange(byRef[ref], 1, 1, HEADERS.length).clearContent();
        totalCleared++;
      }
    });

    // 3) Append new issues to the end of the zone tab.
    if (toAppend.length > 0) {
      sheet
        .getRange(sheet.getLastRow() + 1, 1, toAppend.length, HEADERS.length)
        .setValues(toAppend);
      totalAdded += toAppend.length;
    }
  });

  Logger.log(
    "[syncZones] Done — added " + totalAdded +
    ", updated " + totalUpdated +
    ", cleared " + totalCleared
  );
}

/** reference_no → row number map for a zone tab (header is row 1). */
function getRefRowMap(sheet) {
  var map = {};
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return map;
  var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    var ref = String(data[i][0] || "").trim();
    if (ref && map[ref] === undefined) map[ref] = i + 2;
  }
  return map;
}

/* ------------------------------------------------------------------ *
 *  syncIssues — append new issues to the hidden master tab            *
 * ------------------------------------------------------------------ */

function syncIssues() {
  var sheet = getSheet();
  if (!sheet) {
    Logger.log("Sheet '" + MASTER_SHEET_NAME + "' not found");
    return;
  }

  var existing = getExistingReferences(sheet);

  var kamEmail = fetchKamEmails();
  var issues = fetchIssues();
  if (!issues) return;

  var toAdd = [];
  issues.forEach(function (issue) {
    var ref = String(issue.reference_no || "").trim();
    if (!ref || existing[ref]) return;
    toAdd.push(buildRow(issue, kamEmail));
  });

  if (toAdd.length === 0) {
    Logger.log("[syncIssues] Nothing new (" + issues.length + " issues checked)");
    return;
  }

  sheet
    .getRange(sheet.getLastRow() + 1, 1, toAdd.length, HEADERS.length)
    .setValues(toAdd);
  Logger.log("[syncIssues] Appended " + toAdd.length + " new issue(s)");
}

/* ------------------------------------------------------------------ *
 *  syncOpsToSupabase — push OPS fields from all tabs into Supabase    *
 *  (manual repair / verification button — safe to run anytime)        *
 * ------------------------------------------------------------------ */

function syncOpsToSupabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = SYNC_SHEETS;
  var patched = 0;
  var skipped = 0;

  sheets.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) return;
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;

    for (var r = 2; r <= lastRow; r++) {
      var ref = getCell(sheet, r, 1);
      if (!ref) continue;

      var updates = {};

      var status = getCell(sheet, r, COL_STATUS);
      if (status) {
        updates.status = status;       // KAM status
        updates.ops_status = mapKamStatusToOps(status); // mapped OPS status
        updates.ops_status_at = new Date().toISOString();
      }

      var remark1 = sheet.getRange(r, COL_REMARK1).getValue();
      if (remark1 !== null && String(remark1).trim() !== "") {
        updates.ops_remark1 = String(remark1);
        var at1 = sheet.getRange(r, COL_REMARK1_AT).getValue();
        updates.ops_remark1_at =
          at1 instanceof Date ? at1.toISOString() : new Date().toISOString();
        // 1st remarks hit → auto-set both OPS and KAM status to "In Progress"
        updates.ops_status = "In Progress";
        updates.status = "In Progress";
        updates.ops_status_at = new Date().toISOString();
      }

      var remark2 = sheet.getRange(r, COL_REMARK2).getValue();
      if (remark2 !== null && String(remark2).trim() !== "") {
        updates.ops_remark2 = String(remark2);
        var at2 = sheet.getRange(r, COL_REMARK2_AT).getValue();
        updates.ops_remark2_at =
          at2 instanceof Date ? at2.toISOString() : new Date().toISOString();
      }

      if (Object.keys(updates).length === 0) {
        skipped++;
        continue;
      }

      if (updateIssue(ref, updates)) patched++;
    }
  });

  Logger.log(
    "[syncOpsToSupabase] Done — patched " + patched +
    " issue(s), skipped " + skipped + " (no ops data)"
  );
  return "Patched " + patched + " issue(s) from the sheet";
}

function buildRow(issue, kamEmail) {
  return [
    String(issue.reference_no || ""),
    kamEmail[String(issue.kam_id)] || "",
    issue.zone || "",
    issue.hub || "",
    issue.category || "",
    issue.subcategory || "",
    issue.priority || "",
    issue.parcel_id || "",
    issue.description || "",
    issue.status || "Open",
    issue.ops_remark1 || "",
    issue.ops_remark1_at ? new Date(issue.ops_remark1_at) : "",
    issue.ops_remark2 || "",
    issue.ops_remark2_at ? new Date(issue.ops_remark2_at) : "",
  ];
}

function getExistingReferences(sheet) {
  var refs = {};
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return refs;
  var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    var ref = String(data[i][0] || "").trim();
    if (ref) refs[ref] = true;
  }
  return refs;
}

function fetchIssues() {
  return fetchJson(
    SUPABASE_URL +
      "/rest/v1/issues?select=reference_no,kam_id,zone,hub,category,subcategory,priority,parcel_id,description,status,ops_status,ops_remark1,ops_remark1_at,ops_remark2,ops_remark2_at&order=created_at.desc&limit=500"
  );
}

function fetchKamEmails() {
  var kams = fetchJson(
    SUPABASE_URL + "/rest/v1/kams?select=id,email&limit=1000"
  );
  var map = {};
  (kams || []).forEach(function (k) {
    map[String(k.id)] = k.email || "";
  });
  return map;
}

function fetchJson(url) {
  var options = {
    method: "GET",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: "Bearer " + SUPABASE_SERVICE_KEY,
      "Content-Type": "application/json",
    },
    muteHttpExceptions: true,
  };
  var res = UrlFetchApp.fetch(url, options);
  if (res.getResponseCode() !== 200) {
    Logger.log("[fetchJson] HTTP " + res.getResponseCode() + ": " + res.getContentText());
    return null;
  }
  return JSON.parse(res.getContentText());
}

/* ------------------------------------------------------------------ *
 *  Auto triggers + menu                                               *
 * ------------------------------------------------------------------ */

/** Install 5-minute triggers once (call from onOpen). */
function ensureTriggers() {
  var handlers = ScriptApp.getProjectTriggers().map(function (t) {
    return t.getHandlerFunction();
  });
  if (handlers.indexOf("syncZones") === -1) {
    ScriptApp.newTrigger("syncZones").timeBased().everyMinutes(5).create();
    Logger.log("[ensureTriggers] Installed syncZones trigger (every 5 min)");
  }
  if (handlers.indexOf("syncIssues") === -1) {
    ScriptApp.newTrigger("syncIssues").timeBased().everyMinutes(5).create();
    Logger.log("[ensureTriggers] Installed syncIssues trigger (every 5 min)");
  }
  // Installable onEdit trigger — required for edits made by ops staff
  // (the owner's simple onEdit only fires for the owner's own edits).
  if (handlers.indexOf("onEdit") === -1) {
    ScriptApp.newTrigger("onEdit").onEdit().create();
    Logger.log("[ensureTriggers] Installed installable onEdit trigger");
  }
}

function onOpen() {
  ensureTriggers();
  SpreadsheetApp.getUi()
    .createMenu("🔄 Issue Sync")
    .addItem("Sync from Supabase now", "syncIssues")
    .addSeparator()
    .addItem("Sync zone tabs from Supabase now", "syncZones")
    .addSeparator()
    .addItem("Push ops remarks to Supabase now", "syncOpsToSupabase")
    .addToUi();
}

/* ------------------------------------------------------------------ *
 *  Web app — control panel (optional)                                *
 * ------------------------------------------------------------------ */

function doGet(e) {
  if (e && e.parameter && e.parameter.sync === "1") {
    syncIssues();
  }
  if (e && e.parameter && e.parameter.synczones === "1") {
    syncZones();
  }
  if (e && e.parameter && e.parameter.syncops === "1") {
    syncOpsToSupabase();
  }

  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head>' +
    '<base target="_top"><meta charset="utf-8">' +
    '<style>' +
    'body{font-family:system-ui,-apple-system,sans-serif;background:#f1f5f9;color:#0f172a;margin:0;padding:24px;}' +
    '.card{max-width:640px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.08);}' +
    'h1{font-size:20px;margin:0 0 4px;}' +
    'p{color:#475569;margin:4px 0;font-size:14px;line-height:1.6;}' +
    '.btn{display:inline-block;background:#2552e8;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;margin-top:16px;text-decoration:none;margin-right:8px;}' +
    '.btn:hover{background:#1e40db;}' +
    '.btn.alt{background:#0e7490;}' +
    '.btn.alt:hover{background:#0e5c73;}' +
    '.divider{height:1px;background:#e2e8f0;margin:20px 0;}' +
    'code{background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:13px;}' +
    '</style></head><body>' +
    '<div class="card">' +
    '<h1>🔄 Issue Sync</h1>' +
    '<p>Central Issues Escalation — Supabase sync panel</p>' +
    '<div class="divider"></div>' +
    '<p>Ops staff work in the zone tabs (ISD, SUB, OSD, CTG, Central sort, TNL).</p>' +
    '<p>This script runs automatically inside the Google Sheet:</p>' +
    '<p>• <b>onEdit()</b> — syncs OPS status &amp; remarks from any zone tab to Supabase instantly<br>' +
    '• <b>syncZones()</b> — reconciles all zone tabs with Supabase (runs every 5 min via trigger)<br>' +
    '• <b>syncIssues()</b> — appends new issues to the master tab<br>' +
    '• <b>syncOpsToSupabase()</b> — pushes OPS remarks/status from the sheet into Supabase<br>' +
    '• <b>onOpen()</b> — adds the 🔄 Issue Sync menu + installs triggers</p>' +
    '<div class="divider"></div>' +
    '<p>Run a manual sync right now:</p>' +
    '<a class="btn" href="?synczones=1">Sync zone tabs from Supabase</a>' +
    '<a class="btn alt" href="?sync=1">Sync master tab from Supabase</a>' +
    '<div class="divider"></div>' +
    '<p>Ops remarks in the sheet not showing in the app? Push them now:</p>' +
    '<a class="btn" href="?syncops=1">Push ops remarks to Supabase</a>' +
    '</div></body></html>'
  );
}
