// Text for the "Update available" dialog, in the app's six languages. Kept separate from translations.js on
// purpose: the dialog appears at launch, before the (large) language bundles have loaded, so it must not depend
// on them. {placeholders} are filled by fillUpdateText(); English is the fallback for any missing key.
const en = {
  title: 'Update available',
  message: 'A new version of Key Shop is available. Please update to keep using the app.',
  versions: 'Installed: {installed}  →  New: {latest}',
  update: 'Update now',
  later: 'Later',
  retry: 'Try again',
  downloading: 'Downloading update… {percent}%',
  allowInstall: 'To install the update, allow "Install unknown apps" for Key Shop on the screen that just opened, then come back and tap Update now.',
  opened: 'Follow the installer to finish the update. If nothing opened, tap Update now again.',
  failed: 'The update could not be downloaded. Check your internet connection and try again.',
  checksum: 'The downloaded file could not be verified, so it was not installed. Please try again.',
};

const hi = {
  title: 'अपडेट उपलब्ध है',
  message: 'Key Shop का नया संस्करण उपलब्ध है। ऐप का उपयोग जारी रखने के लिए कृपया अपडेट करें।',
  versions: 'इंस्टॉल: {installed}  →  नया: {latest}',
  update: 'अभी अपडेट करें',
  later: 'बाद में',
  retry: 'फिर से कोशिश करें',
  downloading: 'अपडेट डाउनलोड हो रहा है… {percent}%',
  allowInstall: 'अपडेट इंस्टॉल करने के लिए अभी खुली स्क्रीन पर Key Shop के लिए "अज्ञात ऐप्स इंस्टॉल करें" की अनुमति दें, फिर वापस आकर "अभी अपडेट करें" दबाएँ।',
  opened: 'अपडेट पूरा करने के लिए इंस्टॉलर का पालन करें। यदि कुछ नहीं खुला, तो "अभी अपडेट करें" फिर से दबाएँ।',
  failed: 'अपडेट डाउनलोड नहीं हो सका। अपना इंटरनेट कनेक्शन जाँचें और फिर कोशिश करें।',
  checksum: 'डाउनलोड की गई फ़ाइल सत्यापित नहीं हो सकी, इसलिए इंस्टॉल नहीं की गई। कृपया फिर कोशिश करें।',
};

const ta = {
  title: 'புதிய பதிப்பு உள்ளது',
  message: 'Key Shop-இன் புதிய பதிப்பு கிடைக்கிறது. செயலியைத் தொடர்ந்து பயன்படுத்த, தயவுசெய்து புதுப்பிக்கவும்.',
  versions: 'நிறுவியது: {installed}  →  புதியது: {latest}',
  update: 'இப்போது புதுப்பி',
  later: 'பின்னர்',
  retry: 'மீண்டும் முயற்சி',
  downloading: 'புதுப்பிப்பு பதிவிறக்கப்படுகிறது… {percent}%',
  allowInstall: 'புதுப்பிப்பை நிறுவ, இப்போது திறந்த திரையில் Key Shop-க்கு "அறியப்படாத செயலிகளை நிறுவு" அனுமதியை வழங்கி, திரும்பி வந்து "இப்போது புதுப்பி" அழுத்தவும்.',
  opened: 'புதுப்பிப்பை முடிக்க நிறுவியின் வழிமுறைகளைப் பின்பற்றவும். எதுவும் திறக்கவில்லை என்றால், "இப்போது புதுப்பி" மீண்டும் அழுத்தவும்.',
  failed: 'புதுப்பிப்பைப் பதிவிறக்க முடியவில்லை. இணைய இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.',
  checksum: 'பதிவிறக்கிய கோப்பைச் சரிபார்க்க முடியவில்லை, எனவே நிறுவப்படவில்லை. மீண்டும் முயற்சிக்கவும்.',
};

const te = {
  title: 'అప్‌డేట్ అందుబాటులో ఉంది',
  message: 'Key Shop కొత్త వెర్షన్ అందుబాటులో ఉంది. యాప్‌ను ఉపయోగించడం కొనసాగించడానికి దయచేసి అప్‌డేట్ చేయండి.',
  versions: 'ఇన్‌స్టాల్ అయినది: {installed}  →  కొత్తది: {latest}',
  update: 'ఇప్పుడే అప్‌డేట్ చేయండి',
  later: 'తర్వాత',
  retry: 'మళ్లీ ప్రయత్నించండి',
  downloading: 'అప్‌డేట్ డౌన్‌లోడ్ అవుతోంది… {percent}%',
  allowInstall: 'అప్‌డేట్‌ను ఇన్‌స్టాల్ చేయడానికి, ఇప్పుడే తెరుచుకున్న స్క్రీన్‌లో Key Shop కోసం "తెలియని యాప్‌లను ఇన్‌స్టాల్ చేయండి" అనుమతి ఇచ్చి, తిరిగి వచ్చి "ఇప్పుడే అప్‌డేట్ చేయండి" నొక్కండి.',
  opened: 'అప్‌డేట్ పూర్తి చేయడానికి ఇన్‌స్టాలర్ సూచనలను అనుసరించండి. ఏదీ తెరుచుకోకపోతే, "ఇప్పుడే అప్‌డేట్ చేయండి" మళ్లీ నొక్కండి.',
  failed: 'అప్‌డేట్‌ను డౌన్‌లోడ్ చేయలేకపోయాం. ఇంటర్నెట్ కనెక్షన్‌ను తనిఖీ చేసి మళ్లీ ప్రయత్నించండి.',
  checksum: 'డౌన్‌లోడ్ చేసిన ఫైల్‌ను ధృవీకరించలేకపోయాం, కాబట్టి ఇన్‌స్టాల్ చేయలేదు. దయచేసి మళ్లీ ప్రయత్నించండి.',
};

const kn = {
  title: 'ಅಪ್‌ಡೇಟ್ ಲಭ್ಯವಿದೆ',
  message: 'Key Shop ನ ಹೊಸ ಆವೃತ್ತಿ ಲಭ್ಯವಿದೆ. ಆ್ಯಪ್ ಬಳಸುವುದನ್ನು ಮುಂದುವರಿಸಲು ದಯವಿಟ್ಟು ಅಪ್‌ಡೇಟ್ ಮಾಡಿ.',
  versions: 'ಇನ್‌ಸ್ಟಾಲ್ ಆಗಿರುವುದು: {installed}  →  ಹೊಸದು: {latest}',
  update: 'ಈಗ ಅಪ್‌ಡೇಟ್ ಮಾಡಿ',
  later: 'ನಂತರ',
  retry: 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',
  downloading: 'ಅಪ್‌ಡೇಟ್ ಡೌನ್‌ಲೋಡ್ ಆಗುತ್ತಿದೆ… {percent}%',
  allowInstall: 'ಅಪ್‌ಡೇಟ್ ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಲು, ಈಗಷ್ಟೇ ತೆರೆದ ಪರದೆಯಲ್ಲಿ Key Shop ಗೆ "ಅಪರಿಚಿತ ಆ್ಯಪ್‌ಗಳನ್ನು ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಿ" ಅನುಮತಿ ನೀಡಿ, ಹಿಂತಿರುಗಿ "ಈಗ ಅಪ್‌ಡೇಟ್ ಮಾಡಿ" ಒತ್ತಿರಿ.',
  opened: 'ಅಪ್‌ಡೇಟ್ ಪೂರ್ಣಗೊಳಿಸಲು ಇನ್‌ಸ್ಟಾಲರ್ ಸೂಚನೆಗಳನ್ನು ಅನುಸರಿಸಿ. ಏನೂ ತೆರೆಯದಿದ್ದರೆ, "ಈಗ ಅಪ್‌ಡೇಟ್ ಮಾಡಿ" ಮತ್ತೆ ಒತ್ತಿರಿ.',
  failed: 'ಅಪ್‌ಡೇಟ್ ಡೌನ್‌ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ. ನಿಮ್ಮ ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕವನ್ನು ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
  checksum: 'ಡೌನ್‌ಲೋಡ್ ಮಾಡಿದ ಫೈಲ್ ಅನ್ನು ಪರಿಶೀಲಿಸಲಾಗಲಿಲ್ಲ, ಆದ್ದರಿಂದ ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
};

const ml = {
  title: 'അപ്‌ഡേറ്റ് ലഭ്യമാണ്',
  message: 'Key Shop-ന്റെ പുതിയ പതിപ്പ് ലഭ്യമാണ്. ആപ്പ് തുടർന്ന് ഉപയോഗിക്കാൻ ദയവായി അപ്‌ഡേറ്റ് ചെയ്യുക.',
  versions: 'ഇൻസ്റ്റാൾ ചെയ്തത്: {installed}  →  പുതിയത്: {latest}',
  update: 'ഇപ്പോൾ അപ്‌ഡേറ്റ് ചെയ്യുക',
  later: 'പിന്നീട്',
  retry: 'വീണ്ടും ശ്രമിക്കുക',
  downloading: 'അപ്‌ഡേറ്റ് ഡൗൺലോഡ് ചെയ്യുന്നു… {percent}%',
  allowInstall: 'അപ്‌ഡേറ്റ് ഇൻസ്റ്റാൾ ചെയ്യാൻ, ഇപ്പോൾ തുറന്ന സ്ക്രീനിൽ Key Shop-ന് "അജ്ഞാത ആപ്പുകൾ ഇൻസ്റ്റാൾ ചെയ്യുക" അനുമതി നൽകിയ ശേഷം തിരികെ വന്ന് "ഇപ്പോൾ അപ്‌ഡേറ്റ് ചെയ്യുക" അമർത്തുക.',
  opened: 'അപ്‌ഡേറ്റ് പൂർത്തിയാക്കാൻ ഇൻസ്റ്റാളറിന്റെ നിർദ്ദേശങ്ങൾ പിന്തുടരുക. ഒന്നും തുറന്നില്ലെങ്കിൽ, "ഇപ്പോൾ അപ്‌ഡേറ്റ് ചെയ്യുക" വീണ്ടും അമർത്തുക.',
  failed: 'അപ്‌ഡേറ്റ് ഡൗൺലോഡ് ചെയ്യാൻ കഴിഞ്ഞില്ല. ഇന്റർനെറ്റ് കണക്ഷൻ പരിശോധിച്ച് വീണ്ടും ശ്രമിക്കുക.',
  checksum: 'ഡൗൺലോഡ് ചെയ്ത ഫയൽ പരിശോധിക്കാൻ കഴിഞ്ഞില്ല, അതിനാൽ ഇൻസ്റ്റാൾ ചെയ്തില്ല. ദയവായി വീണ്ടും ശ്രമിക്കുക.',
};

const TEXT = { en, hi, ta, te, kn, ml };

export function updateText(lang) {
  const chosen = TEXT[lang] || en;
  return (key) => chosen[key] || en[key] || key;
}

export function fillUpdateText(template, values) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (values[k] !== undefined ? String(values[k]) : m));
}
