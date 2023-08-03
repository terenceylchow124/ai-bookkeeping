const SPREADSHEET_ID = 'Your google spread sheet id';
const FOLDER_ID = 'Your google drive folder id';
const OPENAI_API_KEY = PropertiesService.getScriptProperties().getProperty('openAIKey');


function doGet() {
  var x = HtmlService.createTemplateFromFile("index");
  var y = x.evaluate();
  var z = y.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return z;
}


function doGetSheetName() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = sheet.getSheets();
  var i, data = [];

  for(i in sheets){
    if (sheets[i].getName() != "SUMMARY") {
      data.push(sheets[i].getName());
    }
  }
  console.log(data)
  return data;
}


function doSubmit(inputdataToSheet) {
  const sheetName = inputdataToSheet.sheetName;
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
  const lastRow = sheet.getLastRow();

  inputdataToSheet["weekday"] = calculateWeekday(inputdataToSheet["date"]);
  inputdataToSheet["amount"] = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'CAD', currencyDisplay: 'symbol' }).format(parseFloat(inputdataToSheet["amount"]));

  inputdataToSheet["id"] = lastRow > 1 ? sheet.getRange(lastRow, 1).getValue() + 1 : 1 ;

  const row = [
    inputdataToSheet["id"], inputdataToSheet["item"], inputdataToSheet["category"],
    inputdataToSheet["date"], inputdataToSheet["weekday"], inputdataToSheet["amount"],
    "", "", inputdataToSheet["url"]
  ];

  console.log(row);

  const range = sheet.getRange(lastRow + 1, 1, 1, row.length);
  range.setValues([row]);

  var itemToAmountRange = sheet.getRange(lastRow + 1, 2, 1, row.length - 1);
  itemToAmountRange.setHorizontalAlignment("right");

  const submitRep = {
    'status': true,
    'data': JSON.stringify(inputdataToSheet)
  }
  return submitRep;
}


function doUpload(obj) {

  ocrResult = doOCR(obj);
  gptResult = callChatGPT(ocrResult);

  const jsn = JSON.parse(gptResult);
  const fileName = `${jsn.date}-${jsn.item}`;

  const blob = Utilities.newBlob(Utilities.base64Decode(obj.data), obj.mimeType, fileName);
  const folder = DriveApp.getFolderById(FOLDER_ID);

  const file = folder.createFile(blob);
  const fileURL = file.getUrl();

  const uploadRep = {
    'status': true,
    'url': fileURL,
    'gptResult': gptResult
  }
  return uploadRep;
}


function doOCR(obj) {
    const resource = {
      title: obj.fileName,
      mimeType: obj.mimeType
    }
    const imageBlob = Utilities.newBlob(Utilities.base64Decode(obj.data), obj.mimeType, obj.fileName);
    const options = { ocr: true }

    const docFile = Drive.Files.insert(resource, imageBlob, options);

    const ocrResult = DocumentApp.openById(docFile.id).getBody().getText();
    Drive.Files.remove(docFile.id);
    return ocrResult;
}


function callChatGPT(data) {
  if (!OPENAI_API_KEY) {
    throw new Error('ChatGPT API Key script property is missing');
  }

  const apiUrl = 'https://api.openai.com/v1/chat/completions';
  const options = {
    method: 'post',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      messages: [
        {
          "role": "system",
          "content": "You are a helpful assistant helping on bookkeeping, \
                      please extract store name, date, amount of the receipt's data. \
                      You are asked to provide Javascript dictionary containing below keys, \
                      1) 'item': name of the store; \
                      2) 'date':  date of the receipt (in 'yyyy-MM-dd' format); \
                      3) 'weekday': Day of the week of 'Date', three-letter abbreviation (for example, 'Mon'); \
                      4) 'amount': total amount of the receipt \
                      Please do not reply anything except the json"
        },
        {
          "role": "user", "content": `receipt's data: ${data}`
        }
      ],
      model: "gpt-3.5-turbo"
    })
  }
  const rep = UrlFetchApp.fetch(apiUrl, options);
  const gptResult = rep.getContentText();
  const jsn = JSON.parse(gptResult);

  if(!rep.getResponseCode().toString().startsWith('2')) {
    return null;
  }

  if (!jsn.choices || jsn.choices.length === 0) {
    return null;
  }

  console.log(gptResult);
  return jsn.choices[0].message.content;
}


function calculateWeekday(dateString) {
  const date = new Date(dateString);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[date.getDay()];
}
