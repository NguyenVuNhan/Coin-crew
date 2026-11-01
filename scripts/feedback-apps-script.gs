/**
 * CoinCrew feedback receiver and weekly email digest.
 *
 * Receives feedback rows POSTed from the CoinCrew Cloudflare Worker, appends new rows
 * to the first sheet of the active Google Sheet (de-duplicating by id), and sends
 * a weekly email digest with an HTML table of feedback submitted over the last 7 days.
 *
 * For setup instructions, triggers, and deployment details, see docs/setup.md section 4.8.
 */

function doPost(e) {
  var body;
  try {
    body = (e && e.postData && e.postData.contents) ? JSON.parse(e.postData.contents) : null;
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!body || body.token !== token) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  var added = 0;
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var headers = ['id', 'createdAt', 'type', 'message', 'screen', 'device', 'lang', 'appVersion', 'contact'];

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
    }

    var lastRow = sheet.getLastRow();
    var existingIds = {};
    if (lastRow > 0) {
      var idValues = sheet.getRange(1, 1, lastRow, 1).getValues();
      for (var i = 0; i < idValues.length; i++) {
        var idVal = idValues[i][0];
        if (idVal !== '' && idVal !== null && idVal !== undefined) {
          existingIds[String(idVal)] = true;
        }
      }
    }

    var rows = Array.isArray(body.rows) ? body.rows : [];
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j];
      if (r && r.id != null && r.id !== '' && !existingIds[String(r.id)]) {
        sheet.appendRow([
          safeCell(r.id),
          safeCell(r.createdAt),
          safeCell(r.type),
          safeCell(r.message),
          safeCell(r.screen),
          safeCell(r.device),
          safeCell(r.lang),
          safeCell(r.appVersion),
          safeCell(r.contact)
        ]);
        existingIds[String(r.id)] = true;
        added++;
      }
    }
  } finally {
    lock.releaseLock();
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: true, added: added }))
    .setMimeType(ContentService.MimeType.JSON);
}

function sendWeeklyDigest() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return;
  }

  var now = new Date();
  var sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  var values = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  var matchingRows = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    for (var c = 0; c < row.length; c++) {
      if (typeof row[c] === 'string' && row[c].charAt(0) === "'") {
        row[c] = row[c].slice(1);
      }
    }

    var rawCreatedAt = row[1]; // column B (createdAt)
    if (!rawCreatedAt) {
      continue;
    }
    var createdDate = (rawCreatedAt instanceof Date) ? rawCreatedAt : new Date(rawCreatedAt);
    if (isNaN(createdDate.getTime())) {
      continue;
    }
    if (createdDate.getTime() >= sevenDaysAgo.getTime()) {
      matchingRows.push(row);
    }
  }

  if (matchingRows.length === 0) {
    return;
  }

  var dateStr = Utilities.formatDate(sevenDaysAgo, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  var subject = 'CoinCrew feedback \u2013 week of ' + dateStr;

  var headers = ['id', 'createdAt', 'type', 'message', 'screen', 'device', 'lang', 'appVersion', 'contact'];

  var tableHeaderHtml = '<tr>' + headers.map(function(h) {
    return '<th style="border: 1px solid #ccc; padding: 6px 10px; text-align: left; background-color: #f5f5f5;">' + escapeHtml(h) + '</th>';
  }).join('') + '</tr>';

  var tableRowsHtml = matchingRows.map(function(row) {
    var cells = [];
    for (var c = 0; c < 9; c++) {
      cells.push('<td style="border: 1px solid #ccc; padding: 6px 10px; vertical-align: top;">' + escapeHtml(formatCell(row[c])) + '</td>');
    }
    return '<tr>' + cells.join('') + '</tr>';
  }).join('');

  var htmlBody = '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; font-family: sans-serif; font-size: 13px;">' +
    '<thead>' + tableHeaderHtml + '</thead>' +
    '<tbody>' + tableRowsHtml + '</tbody>' +
    '</table>';

  var textLines = [];
  textLines.push(headers.join(' | '));
  textLines.push(headers.map(function() { return '---'; }).join(' | '));
  for (var j = 0; j < matchingRows.length; j++) {
    var rowText = [];
    for (var col = 0; col < 9; col++) {
      var cellText = formatCell(matchingRows[j][col]);
      rowText.push(cellText.replace(/\r?\n/g, ' '));
    }
    textLines.push(rowText.join(' | '));
  }
  var plainText = textLines.join('\n');

  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    subject: subject,
    body: plainText,
    htmlBody: htmlBody
  });
}

function escapeHtml(str) {
  if (str === null || str === undefined) {
    return '';
  }
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCell(val) {
  if (val === null || val === undefined) {
    return '';
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  return String(val);
}

function safeCell(v) {
  if (v === null || v === undefined) {
    return '';
  }
  var str = typeof v === 'string' ? v : String(v);
  if (/^[=+\-@\t\r]/.test(str)) {
    return "'" + str;
  }
  return str;
}
