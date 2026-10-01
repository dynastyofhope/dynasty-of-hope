/**
 * =============================================================================
 *  DYNASTY OF HOPE FOUNDATION
 *  Goni Gora Community Development Football Championship — 2026
 *  Google Sheet registration backend (Apps Script Web App)
 * =============================================================================
 *
 *  WHAT THIS DOES
 *  --------------
 *  Turns a Google Sheet into the one central registration database:
 *   • a club fills the form on the website  -> a row appears in YOUR Sheet
 *   • each player gets a row in the Players sheet, passport photo in YOUR Drive
 *   • the club gets a confirmation email (and SMS if you switch it on)
 *   • when you set a row to "approved", the club gets the CONFIRMED email/SMS
 *   • the public website shows only approved teams, with NO phone numbers,
 *     addresses or passports — those stay inside your private Sheet
 *
 * -----------------------------------------------------------------------------
 *  SETUP (10 minutes, do it once)
 * -----------------------------------------------------------------------------
 *  1. Create a new Google Sheet, name it "Goni Gora Championship 2026".
 *  2. In that Sheet: Extensions -> Apps Script.  Delete any code, paste THIS file.
 *  3. Click Run -> setup  (the function named `setup`), and accept the permissions.
 *     It creates the Teams / Players / Officials / Log tabs and a private Drive
 *     folder called "Goni Gora Passports", then prints your Web App details.
 *  4. Deploy -> New deployment -> (gear) Web app
 *        Execute as : Me
 *        Who has access : Anyone          <-- required, clubs are not signed in
 *     Copy the /exec URL.
 *  5. Back in the Apps Script editor: Project Settings (gear) -> Script
 *     Properties -> Add property:
 *        ADMIN_TOKEN  =  a long random secret only you know, e.g. k7Xq2...
 *     (Optional) TERMII_API_KEY, TERMII_SENDER_ID, SMS_ADMIN_PHONE for SMS.
 *     (Optional) WHATSAPP_MODE = termii  -> send WhatsApp automatically through
 *               Termii (needs a Termii WhatsApp sender/device). Also add
 *               TERMII_WHATSAPP_SENDER. With no WhatsApp setup the script still
 *               builds a free wa.me click-to-chat link and puts it in the email.
 *  6. Paste the /exec URL and the same ADMIN_TOKEN into the website file
 *     (index.html -> var CONFIG = { cloudUrl: '...', adminToken: '...' })
 *     then upload index.html to GitHub Pages.
 *  7. Deploy -> Manage deployments -> (pencil) -> Version: New version, each time
 *     you change this script, or the website will still call the old code.
 *
 * -----------------------------------------------------------------------------
 *  HOW THE WEBSITE TALKS TO THIS SCRIPT
 * -----------------------------------------------------------------------------
 *  GET  ?action=public                     -> approved teams only, no private data
 *  GET  ?action=list&token=ADMIN_TOKEN     -> everything (you, in the admin panel)
 *  GET  ?action=ping                       -> {"ok":true}
 *  All GETs support &callback=fn  (JSONP, so reading works from any website).
 *
 *  POST {action:'register', ...}           -> writes the club, sends confirmations
 *  POST {action:'official', ...}           -> writes a referee / official
 *  POST {action:'status', token, ref, status}  -> approve/reject + CONFIRMED message
 *  POST bodies are sent as text/plain so the browser never triggers a CORS
 *  pre-flight request.
 * =============================================================================
 */

var TOURNAMENT = {
  name:    'Goni Gora Community Development Football Championship',
  org:     'Dynasty of Hope Foundation',
  season:  '2026',
  venue:   'Goni Gora Community Field, Chikun LGA, Kaduna State',
  kickoff: 'Saturday, 26 September 2026',
  closing: 'Sunday, 4 October 2026',
  hotline: '0703 382 8292',
  waOffice: 'https://wa.me/2347033828292',
  email:   'dynastyofhope2023@gmail.com',
  office:  'No. 5 Bravo Close, Kwakwachi, Kano, Nigeria'
};

var MAX_TEAMS = 16;
var MAX_PLAYERS = 15;

/* =============================================================================
   1. ONE-TIME SETUP
   ============================================================================= */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  ensureSheet_(ss, 'Teams', ['Ref', 'ClientID', 'Timestamp', 'Status', 'Team', 'Community',
    'LGA', 'Coach', 'CoachPhone', 'ContactEmail', 'Captain', 'JerseyColours',
    'Players', 'Notes', 'WhatsAppLink']);
  ensureSheet_(ss, 'Players', ['Ref', 'TeamRef', 'Timestamp', 'JerseyNo', 'FullName',
    'Position', 'Age', 'Phone', 'Address', 'NIN', 'Captain', 'PassportURL']);
  ensureSheet_(ss, 'Documents', ['Ref', 'Timestamp', 'Uploader', 'DocType', 'Note', 'FileURL']);
  ensureSheet_(ss, 'Officials', ['Ref', 'Timestamp', 'Status', 'FullName', 'Role', 'Phone',
    'Address', 'Email', 'Experience', 'Qualification', 'PassportURL', 'FormURL']);
  ensureSheet_(ss, 'Log', ['Timestamp', 'Event', 'Detail', 'Channel', 'Status']);

  var folder = ensureFolder_('Goni Gora Passports');
  props.setProperty('SHEET_ID', ss.getId());
  props.setProperty('DRIVE_FOLDER_ID', folder.getId());
  if (!props.getProperty('ADMIN_TOKEN')) {
    props.setProperty('ADMIN_TOKEN', 'CHANGE-ME-' + Math.random().toString(36).slice(2, 12));
  }
  Logger.log('Setup complete.');
  Logger.log('Spreadsheet : ' + ss.getUrl());
  Logger.log('Passports   : ' + folder.getUrl());
  Logger.log('ADMIN_TOKEN : ' + props.getProperty('ADMIN_TOKEN') + '  (change it!)');
  Logger.log('Now: Deploy -> New deployment -> Web app (Execute as: Me, Anyone).');
  return 'Setup complete. Check View -> Logs.';
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#0d4f9e')
      .setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function ensureFolder_(name) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DRIVE_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recreate below */ } }
  var existing = DriveApp.getFoldersByName(name);
  if (existing.hasNext()) return existing.next();
  return DriveApp.createFolder(name);
}

function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

/* =============================================================================
   2. ENTRY POINTS
   ============================================================================= */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || 'ping';
  var out;

  if (action === 'ping') {
    out = { ok: true, org: TOURNAMENT.org, season: TOURNAMENT.season, time: new Date().toString() };
  } else if (action === 'public') {
    out = { ok: true, updated: new Date().toString(), teams: publicTeams_() };
  } else if (action === 'list') {
    out = tokenOk_(p.token)
      ? { ok: true, updated: new Date().toString(), teams: allTeams_(),
          officials: allOfficials_(), log: recentLog_() }
      : { ok: false, error: 'Wrong or missing admin token.' };
  } else {
    out = { ok: false, error: 'Unknown action: ' + action };
  }

  var json = JSON.stringify(out);
  if (p.callback) {                       // JSONP — readable from any origin
    return ContentService
      .createTextOutput(p.callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { body = (e && e.parameter) || {}; }

  var action = body.action || 'register';
  var out;

  if (action === 'register')            out = registerTeam_(body);
  else if (action === 'official')       out = registerOfficial_(body);
  else if (action === 'document')       out = registerDocument_(body);
  else if (action === 'status')         out = tokenOk_(body.token)
    ? setStatus_(body)
    : { ok: false, error: 'Wrong or missing admin token.' };
  else out = { ok: false, error: 'Unknown action: ' + action };

  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function tokenOk_(token) {
  var want = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  return !!token && !!want && String(token) === String(want);
}

/* =============================================================================
   3. WRITING REGISTRATIONS
   ============================================================================= */
function registerTeam_(body) {
  var ss = ss_();
  var teams = ss.getSheetByName('Teams');
  var playersSh = ss.getSheetByName('Players');
  var team = body.team || {};
  var players = body.players || [];
  var now = new Date();

  if (!team.teamName) return { ok: false, error: 'Team name missing.' };

  // Refuse a duplicate submission (the browser re-sends if the network hiccups)
  var existing = teams.getDataRange().getValues();
  for (var i = 1; i < existing.length; i++) {
    if (body.clientId && String(existing[i][1]) === String(body.clientId)) {
      return { ok: true, ref: existing[i][0], duplicate: true };
    }
  }
  // Respect the 16-team limit (pending + approved)
  var confirmed = 0;
  for (var j = 1; j < existing.length; j++) {
    if (existing[j][3] === 'approved' || existing[j][3] === 'pending') confirmed++;
  }
  if (confirmed >= MAX_TEAMS) {
    return { ok: false, error: 'Registration is closed — all 16 slots are taken.' };
  }

  var ref = 'DoH-' + TOURNAMENT.season + '-' + ('000' + (existing.length)).slice(-4);
  if (players.length > MAX_PLAYERS) players = players.slice(0, MAX_PLAYERS);

  var captain = team.captainName || '';
  for (var c = 0; c < players.length && !captain; c++) {
    if (players[c].captain) captain = players[c].name;
  }

  teams.appendRow([ref, body.clientId || '', now, 'pending', team.teamName,
    team.community || '', team.lga || '', team.coachName || '', team.coachPhone || '',
    team.contactEmail || '', captain, team.jersey || '', players.length, '']);

  var folder = ensureFolder_('Goni Gora Passports');
  var count = 0;
  players.forEach(function (p) {
    var url = '';
    try {
      if (p.passport && p.passport.indexOf('base64,') > -1) {
        url = savePhoto_(folder, p.passport, ref + '-' + (p.name || 'player').replace(/[^\w]+/g, '_'));
      }
    } catch (err) { url = ''; }
    playersSh.appendRow([ref + '-P' + (++count), ref, now, p.no || '', p.name || '',
      p.pos || '', p.age || '', p.phone || '', p.address || '', p.nin || '',
      p.captain ? 'yes' : '', url]);
  });

  log_('Team registered', ref + ' — ' + team.teamName + ' (' + players.length + ' players)');

  // ---- confirmation messages -------------------------------------------------
  var sent = { email: false, sms: false };
  if (team.contactEmail) {
    sent.email = mail_(team.contactEmail, 'Registration received — ' + team.teamName,
      mailReceived_(team, players, ref));
    log_('Confirmation email', ref + ' -> ' + team.contactEmail, 'email',
      sent.email ? 'sent' : 'failed');
  }
  if (team.coachPhone) {
    sent.sms = sms_(team.coachPhone, smsReceived_(team, ref));
    log_('Confirmation SMS', ref + ' -> ' + team.coachPhone, 'sms',
      sent.sms ? 'sent' : 'failed');
    var wa = whatsapp_(team.coachPhone, waReceived_(team, ref));
    sent.whatsapp = wa.sent;
    sent.waLink = wa.link;
  }
  if (team.contactEmail && sent.waLink) {
    /* the free link goes into the email as well, so the club can reach us in one tap */
    mail_(team.contactEmail, 'WhatsApp the tournament office — ' + team.teamName,
      shell_('Talk to us on WhatsApp',
        '<p>Dear ' + (team.coachName || 'Coach') + ',</p>' +
        '<p>Message the tournament office on WhatsApp with one tap:</p>' +
        '<p><a href="' + TOURNAMENT.waOffice + '" style="background:#0d4f9e;color:#fff;' +
        'padding:12px 20px;border-radius:10px;text-decoration:none;display:inline-block">' +
        'Open WhatsApp chat</a></p>' +
        '<p>Or call the hotline <b>' + TOURNAMENT.hotline + '</b>.</p>' + footer_()));
  }
  notifyOffice_(ref + ' — ' + team.teamName + ', coach ' + (team.coachName || '-') + ' ' +
    (team.coachPhone || '') + '. Log in to approve.');

  return { ok: true, ref: ref, emailed: sent.email, smsed: sent.sms };
}

function registerOfficial_(body) {
  var sh = ss_().getSheetByName('Officials');
  var rows = sh.getDataRange().getValues();
  var ref = 'DoH-OFF-' + ('000' + rows.length).slice(-4);
  var now = new Date();
  var folder = ensureFolder_('Goni Gora Passports');
  var url = '';
  try {
    if (body.passport && body.passport.indexOf('base64,') > -1) {
      url = savePhoto_(folder, body.passport, ref);
    }
  } catch (e) { url = ''; }

  sh.appendRow([ref, now, 'pending', body.fullName || '', body.role || '', body.phone || '',
    body.address || '', body.email || '', body.experience || '', body.qualification || '',
    url, '']);
  log_('Official registered', ref + ' — ' + (body.fullName || ''));

  if (body.email) {
    mail_(body.email, 'Official registration received',
      '<p>Dear ' + (body.fullName || 'official') + ',</p><p>Your registration as <b>' +
      (body.role || 'match official') + '</b> for the ' + TOURNAMENT.name +
      ' has been received and is awaiting confirmation by the organising committee.</p>' +
      '<p>We will contact you on <b>' + (body.phone || '') + '</b>.</p>' + footer_());
  }
  if (body.phone) {
    sms_(body.phone, TOURNAMENT.org + ': your registration as ' + (body.role || 'official') +
      ' has been received. We will contact you with your accreditation details. Hotline ' +
      TOURNAMENT.hotline + '.');
    whatsapp_(body.phone, TOURNAMENT.org + ': your registration as ' +
      (body.role || 'official') + ' has been received — we will send your accreditation ' +
      'details shortly. Hotline ' + TOURNAMENT.hotline + '.');
  }
  notifyOffice_('New official: ' + (body.fullName || '') + ' (' + (body.role || '') + ') ' +
    (body.phone || ''));
  return { ok: true, ref: ref };
}

function registerDocument_(body) {
  var sh = ss_().getSheetByName('Documents');
  var rows = sh.getDataRange().getValues();
  var ref = 'DoH-DOC-' + ('000' + rows.length).slice(-4);
  var url = '';
  try {
    if (body.data && body.data.indexOf('base64,') > -1) {
      url = saveFile_(body.data, body.name || ('document-' + ref));
    }
  } catch (err) { url = ''; }
  sh.appendRow([ref, new Date(), body.uploader || '', body.docType || '',
    body.note || '', url]);
  log_('Document uploaded', ref + ' — ' + (body.docType || '') + ' from ' +
    (body.uploader || 'anonymous'));
  notifyOffice_('Document received: ' + (body.docType || 'document') + ' from ' +
    (body.uploader || 'anonymous') + (url ? ' — ' + url : ''));
  return { ok: true, ref: ref, url: url };
}

function saveFile_(dataUrl, name) {
  var parts = dataUrl.split('base64,');
  var mime = (parts[0].match(/data:([^;]+);/) || ['', 'application/octet-stream'])[1];
  var blob = Utilities.newBlob(Utilities.base64Decode(parts[1]), mime, name);
  var file = ensureFolder_('Goni Gora Documents').createFile(blob);
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  return 'https://drive.google.com/file/d/' + file.getId() + '/view';
}

function setStatus_(body) {
  var sh = ss_().getSheetByName('Teams');
  var data = sh.getDataRange().getValues();
  var status = body.status;
  if (['approved', 'pending', 'rejected'].indexOf(status) < 0) {
    return { ok: false, error: 'Bad status.' };
  }
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(body.ref)) {
      sh.getRange(i + 1, 4).setValue(status);
      sh.getRange(i + 1, 14).setValue(body.notes || '');
      var team = {
        teamName: data[i][4], coachName: data[i][7], coachPhone: data[i][8],
        contactEmail: data[i][9], community: data[i][5]
      };
      var messages = [];
      if (status === 'approved') {
        if (team.contactEmail) {
          messages.push(mail_(team.contactEmail, 'CONFIRMED — ' + team.teamName,
            mailConfirmed_(team, data[i][0])) ? 'email sent' : 'email failed');
        }
        if (team.coachPhone) {
          messages.push(sms_(team.coachPhone, smsConfirmed_(team, data[i][0])) ? 'sms sent' : 'sms failed');
          var wa = whatsapp_(team.coachPhone, waConfirmed_(team, data[i][0]));
          messages.push(wa.sent ? 'WhatsApp sent' : 'WhatsApp link ready');
          if (wa.link) {                       // keep a ready-to-tap link on the row
            if (sh.getLastColumn() < 15) sh.getRange(1, 15).setValue('WhatsAppLink');
            sh.getRange(i + 1, 15).setValue(wa.link);
          }
        }
      } else if (status === 'rejected' && team.contactEmail) {
        messages.push(mail_(team.contactEmail, 'Registration update — ' + team.teamName,
          mailRejected_(team, body.notes)) ? 'email sent' : 'email failed');
      }
      log_('Status -> ' + status, data[i][0] + ' — ' + team.teamName +
        (messages.length ? ' (' + messages.join(', ') + ')' : ''));
      return { ok: true, ref: data[i][0], status: status, messages: messages };
    }
  }
  return { ok: false, error: 'Reference not found: ' + body.ref };
}

/* =============================================================================
   4. READING
   ============================================================================= */
function publicTeams_() {
  var data = ss_().getSheetByName('Teams').getDataRange().getValues();
  var players = ss_().getSheetByName('Players').getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][3] !== 'approved') continue;      // nothing public until approved
    var squad = [];
    for (var p = 1; p < players.length; p++) {
      if (players[p][1] !== data[i][0]) continue;
      squad.push({                                 // deliberately NO phone/address/NIN
        no: players[p][3], name: players[p][4], pos: players[p][5],
        age: players[p][6], captain: players[p][10] === 'yes'
      });
    }
    out.push({ ref: data[i][0], teamName: data[i][4], community: data[i][5],
      lga: data[i][6], coachName: data[i][7], captain: data[i][10],
      jersey: data[i][11], status: data[i][3], registered: data[i][2],
      players: squad });
  }
  return out;
}

function allTeams_() {
  var ss = ss_();
  var data = ss.getSheetByName('Teams').getDataRange().getValues();
  var players = ss.getSheetByName('Players').getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    var squad = [];
    for (var p = 1; p < players.length; p++) {
      if (players[p][1] !== data[i][0]) continue;
      squad.push({ no: players[p][3], name: players[p][4], pos: players[p][5],
        age: players[p][6], phone: players[p][7], address: players[p][8],
        nin: players[p][9], captain: players[p][10] === 'yes', passport: players[p][11] });
    }
    out.push({ ref: data[i][0], clientId: data[i][1], registered: data[i][2],
      status: data[i][3], teamName: data[i][4], community: data[i][5], lga: data[i][6],
      coachName: data[i][7], coachPhone: data[i][8], contactEmail: data[i][9],
      captain: data[i][10], jersey: data[i][11], notes: data[i][13], players: squad });
  }
  return out;
}

function allOfficials_() {
  var data = ss_().getSheetByName('Officials').getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    out.push({ ref: data[i][0], registered: data[i][1], status: data[i][2],
      fullName: data[i][3], role: data[i][4], phone: data[i][5], address: data[i][6],
      email: data[i][7], experience: data[i][8], qualification: data[i][9],
      passport: data[i][10] });
  }
  return out;
}

function recentLog_() {
  var data = ss_().getSheetByName('Log').getDataRange().getValues();
  var out = [];
  for (var i = Math.max(1, data.length - 30); i < data.length; i++) {
    out.push({ at: data[i][0], event: data[i][1], detail: data[i][2],
      channel: data[i][3] || 'email', status: data[i][4] || '' });
  }
  return out.reverse();
}

/* =============================================================================
   5. DRIVE, EMAIL, SMS
   ============================================================================= */
function savePhoto_(folder, dataUrl, name) {
  var parts = dataUrl.split('base64,');
  var mime = (parts[0].match(/data:([^;]+);/) || ['', 'image/jpeg'])[1];
  var blob = Utilities.newBlob(Utilities.base64Decode(parts[1]), mime, name + '.jpg');
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);   // admin only
  return 'https://drive.google.com/file/d/' + file.getId() + '/view';
}

function mail_(to, subject, html) {
  try {
    MailApp.sendEmail(to, subject, '', { htmlBody: html, name: TOURNAMENT.org });
    return true;
  } catch (err) {
    log_('Email failed', subject + ' -> ' + to + ' : ' + err, 'email', 'failed');
    return false;
  }
}

function sms_(phone, text) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('TERMII_API_KEY');
  if (!key) return false;                        // SMS is optional
  var to = international_(phone);
  if (!to) return false;
  try {
    UrlFetchApp.fetch('https://api.termii.com/api/sms/send', {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({
        api_key: key, to: to, from: props.getProperty('TERMII_SENDER_ID') || 'DoHope',
        sms: trim_(text), type: 'plain', channel: 'dnd'
      }),
      muteHttpExceptions: true
    });
    return true;
  } catch (err) {
    log_('SMS failed', phone + ' : ' + err, 'sms', 'failed');
    return false;
  }
}

/* -----------------------------------------------------------------------------
   WHATSAPP
   Two ways to reach a club on WhatsApp:

   1. Automatic — Termii (paid, about $0.056 per message). Set Script Properties
      WHATSAPP_MODE = termii, TERMII_API_KEY, TERMII_WHATSAPP_SENDER (the device /
      sender name approved on your Termii WhatsApp account). The message is sent
      the moment a club registers or is approved.

   2. Free click-to-chat — a wa.me link is generated for every registration and
      put inside the confirmation email, and listed in the Log sheet, so you can
      message the club (or they can message you) with one tap, at no cost.
      This is always on and never fails.
   --------------------------------------------------------------------------- */
function waLink_(phone, text) {
  var to = international_(phone);
  if (!to) return '';
  return 'https://wa.me/' + to + '?text=' + encodeURIComponent(text || '');
}

function whatsapp_(phone, text) {
  var props = PropertiesService.getScriptProperties();
  var text1 = trim_(text, 900);
  var link = waLink_(phone, text1);

  if (props.getProperty('WHATSAPP_MODE') !== 'termii') {
    log_('WhatsApp link ready', (phone || '') + ' — ' + link, 'whatsapp', 'link ready');
    return { sent: false, link: link };
  }

  var key = props.getProperty('TERMII_API_KEY');
  var sender = props.getProperty('TERMII_WHATSAPP_SENDER');
  var to = international_(phone);
  if (!key || !sender || !to) {
    log_('WhatsApp skipped', 'missing Termii key/sender or bad number', 'whatsapp', 'not configured');
    return { sent: false, link: link };
  }
  try {
    var res = UrlFetchApp.fetch('https://api.termii.com/api/sms/send', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ api_key: key, to: to, from: sender, sms: text1,
        type: 'plain', channel: 'whatsapp' })
    });
    var ok = res.getResponseCode() < 400;
    log_('WhatsApp sent', (phone || '') + ' — ' + text1.slice(0, 60), 'whatsapp',
      ok ? 'sent' : 'failed');
    if (!ok) {                                   // fall back to the free link
      log_('WhatsApp fallback link', link, 'whatsapp', 'link ready');
      return { sent: false, link: link, error: res.getContentText().slice(0, 200) };
    }
    return { sent: true, link: link };
  } catch (err) {
    log_('WhatsApp failed', phone + ' : ' + err, 'whatsapp', 'failed');
    return { sent: false, link: link, error: String(err) };
  }
}

function notifyOffice_(text) {
  var props = PropertiesService.getScriptProperties();
  if (TOURNAMENT.email) {
    mail_(TOURNAMENT.email, 'New online registration', '<p>' + text + '</p>' + footer_());
  }
  if (props.getProperty('TERMII_API_KEY') && props.getProperty('SMS_ADMIN_PHONE')) {
    sms_(props.getProperty('SMS_ADMIN_PHONE'), text);
  }
}

/* =============================================================================
   6. HELPERS
   ============================================================================= */
function trim_(text, limit) {
  limit = limit || 160;
  text = String(text || '').replace(/\s+/g, ' ').trim();
  return text.length <= limit ? text : text.slice(0, limit - 1) + '…';
}

function international_(phone) {
  var d = String(phone || '').replace(/\D/g, '');
  if (d.indexOf('234') === 0 && d.length === 13) return d;
  if (d.length === 11 && d.charAt(0) === '0') return '234' + d.slice(1);
  if (d.length === 10) return '234' + d;
  return '';
}

function log_(event, detail, channel, status) {
  try {
    ss_().getSheetByName('Log').appendRow([new Date(), event, detail || '',
      channel || '', status || '']);
  } catch (e) { /* never break a registration because logging failed */ }
}

function footer_() {
  return '<p style="color:#5b6b80;font-size:12px">' + TOURNAMENT.org + ' · ' +
    TOURNAMENT.name + '<br>Venue: ' + TOURNAMENT.venue + ' · Kick-off: ' +
    TOURNAMENT.kickoff + '<br>Hotline ' + TOURNAMENT.hotline + ' · ' + TOURNAMENT.office +
    '</p>';
}

function shell_(title, body) {
  return '<div style="background:#f4f7fb;padding:18px;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0a1b33">' +
    '<div style="max-width:620px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #d6e1f0">' +
    '<div style="background:linear-gradient(135deg,#0d4f9e,#062a56);color:#fff;padding:22px 26px">' +
    '<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.85">' +
    TOURNAMENT.org + '</div><div style="font-size:21px;font-weight:800;margin-top:4px">' +
    title + '</div></div><div style="padding:24px 26px;font-size:15px;line-height:1.65">' +
    body + '</div><div style="background:#e8f0fb;padding:14px 26px;font-size:12px;color:#5b6b80">' +
    TOURNAMENT.name + ' · ' + TOURNAMENT.venue + '<br>Kick-off ' + TOURNAMENT.kickoff +
    ' · Hotline ' + TOURNAMENT.hotline + ' · ' + TOURNAMENT.office +
    '</div></div></div>';
}

function mailReceived_(team, players, ref) {
  var rows = players.map(function (p) {
    return '<tr><td style="padding:5px 10px">' + (p.no || '-') +
      '</td><td style="padding:5px 10px">' + (p.name || '') + '</td></tr>';
  }).join('');
  return shell_('Registration received',
    '<p>Dear ' + (team.coachName || 'Coach') + ',</p>' +
    '<p>Thank you for entering the <b>' + TOURNAMENT.name +
    '</b>. Your registration has been <b>received</b> and is waiting for the organising ' +
    'committee to confirm it.</p>' +
    '<p>Reference: <b>' + ref + '</b><br>Team: <b>' + (team.teamName || '') +
    '</b><br>Players submitted: ' + players.length + '</p>' +
    '<table style="border-collapse:collapse;font-size:14px">' + rows + '</table>' +
    '<p style="margin-top:1rem">You will receive a second message confirming your place as ' +
    'soon as the committee approves your entry.</p>' +
    '<p><a href="' + TOURNAMENT.waOffice + '" style="background:#25D366;color:#fff;padding:' +
    '12px 20px;border-radius:10px;text-decoration:none;display:inline-block;font-weight:700">' +
    '💬 Chat with us on WhatsApp</a></p>' +
    '<p style="color:#5b6b80;font-size:13px">Questions? Call or WhatsApp <b>' +
    TOURNAMENT.hotline + '</b>.</p><p>— ' + TOURNAMENT.org + '</p>');
}

function mailConfirmed_(team, ref) {
  return shell_('Registration CONFIRMED',
    '<p>Dear ' + (team.coachName || 'Coach') + ',</p>' +
    '<p style="font-size:17px"><b>Congratulations — your registration is CONFIRMED.</b></p>' +
    '<p><b>' + (team.teamName || '') + '</b> is officially entered for the <b>' +
    TOURNAMENT.name + '</b>.</p>' +
    '<p>Reference: <b>' + ref + '</b><br>Venue: ' + TOURNAMENT.venue + '<br>Kick-off: ' +
    TOURNAMENT.kickoff + '</p>' +
    '<p><b>Please bring to accreditation:</b><br>• This confirmation<br>' +
    '• Passport photographs for any player not yet uploaded<br>• Outstanding player details</p>' +
    '<p><a href="' + TOURNAMENT.waOffice + '" style="background:#25D366;color:#fff;padding:' +
    '12px 20px;border-radius:10px;text-decoration:none;display:inline-block;font-weight:700">' +
    '💬 Chat with us on WhatsApp</a></p>' +
    '<p>Hotline <b>' + TOURNAMENT.hotline + '</b>.</p><p>— ' + TOURNAMENT.org + '</p>');
}

function mailRejected_(team, notes) {
  return shell_('Registration update',
    '<p>Dear ' + (team.coachName || 'Coach') + ',</p>' +
    '<p>Thank you for your interest in the <b>' + TOURNAMENT.name + '</b>.</p>' +
    '<p>Unfortunately we are unable to confirm <b>' + (team.teamName || '') +
    '</b> for this edition' + (notes ? ' — ' + notes : '') + '.</p>' +
    '<p>Please register again next season. Hotline <b>' + TOURNAMENT.hotline +
    '</b>.</p><p>— ' + TOURNAMENT.org + '</p>');
}

function smsReceived_(team, ref) {
  return trim_(TOURNAMENT.org + ': ' + (team.teamName || '') + ' registration received. Ref ' +
    ref + '. We will text you once the committee confirms your place. Hotline ' +
    TOURNAMENT.hotline + '.');
}

function waReceived_(team, ref) {
  return TOURNAMENT.org + ': ' + (team.teamName || '') + ' — registration received. Ref ' +
    ref + '. We will message you again as soon as the committee confirms your place. ' +
    'Hotline ' + TOURNAMENT.hotline + '.';
}

function waConfirmed_(team, ref) {
  return '✅ CONFIRMED — ' + (team.teamName || '') + ' is entered for the ' +
    TOURNAMENT.name + '. Ref ' + ref + '.\n\nVenue: ' + TOURNAMENT.venue +
    '\nKick-off: ' + TOURNAMENT.kickoff + '\nClosing: ' + TOURNAMENT.closing +
    '\n\nPlease bring: this confirmation, passport photographs for any player not yet ' +
    'uploaded, and outstanding player details.\n\nHotline ' + TOURNAMENT.hotline +
    '\n— ' + TOURNAMENT.org;
}

function smsConfirmed_(team, ref) {
  return trim_('CONFIRMED: ' + (team.teamName || '') + ' is entered for the Goni Gora ' +
    'Championship. Ref ' + ref + '. Kick-off ' + TOURNAMENT.kickoff + ' at ' +
    TOURNAMENT.venue + '. Bring player passports. Hotline ' + TOURNAMENT.hotline + '.');
}
