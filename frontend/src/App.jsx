import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { useAuth } from './context/AuthContext';
import { getAssetUrl, downloadAsset, filenameForAsset, API_BASE } from './apiConfig';
import PublicSite from './components/PublicSite';
import CustomSelect from './components/CustomSelect';
import {
  Key, Users, Shield, Radio, BarChart3, Database, LogOut, Check, X,
  Plus, Settings, FileText, Search, UserCheck, MapPin, Camera, AlertTriangle,
  Trash, RefreshCw, Layers, Edit, ExternalLink, Sliders, DollarSign,
  Bell, Eye, EyeOff, CheckCircle2, ChevronRight, Info,
  CreditCard, QrCode, Wallet, Lock, ShieldCheck, Upload, Mail, Phone,
  ArrowRight, ArrowLeft, Building2, Calendar,
  Store, TrendingUp, TrendingDown, UserPlus, Clock, IndianRupee, BadgeCheck,
  ArrowUpRight, ArrowDownRight, Sparkles,
  User, Hash, UploadCloud, Crosshair, FileCheck, Navigation, KeyRound, Car,
  Tag, Package, Boxes, Percent, Image as ImageIcon, Megaphone, BadgePercent,
  Receipt, CalendarRange, Banknote, PlayCircle, MessageCircle, LifeBuoy,
  Download, Fingerprint, Palette, Menu, Home, Languages,
  Wrench, Cpu, Gauge, ScanLine, Headset
} from 'lucide-react';

// Product photos shown on the Dashboard's product-type cards instead of the
// generic line icons below - see DASHBOARD_PRODUCT_CARDS. Swap these .png
// files (src/assets/dashboard-icons/) to change the pictures; the .png
// versions have their black studio background keyed out to transparency
// (see scripts/remove-black-bg.cjs) so they sit cleanly on the card.
import usedMachinesImg from './assets/dashboard-icons/used-machines.png';
import ecmServiceImg from './assets/dashboard-icons/ecm-service.png';
import meterServiceImg from './assets/dashboard-icons/meter-service.png';
import scanningServiceImg from './assets/dashboard-icons/scanning-service.png';
import customerSupportIcon from './assets/dashboard-icons/customer-support.png';
import keyShopLogo from './assets/branding/keyshop-logo.png';

// Shared registry so the hardware Back button/gesture (see the
// CapacitorApp.addListener('backButton', ...) effect in the root App
// component below) can close whatever modal/dialog/in-progress wizard step is
// currently on top, instead of always falling straight through to top-level
// screen navigation. Every modal and multi-step wizard in the app registers
// itself here via useBackHandler() while it's open; the Back listener always
// invokes only the most-recently-opened one first (LIFO), matching how a
// real screen/dialog stack behaves - open two things, Back closes the most
// recent one first.
const backHandlerStack = [];

// Registers `onBack` to run once the next time hardware Back is pressed,
// for as long as `active` is true (e.g. `showAddModal`, or `step > 1` in a
// wizard). Automatically unregisters when `active` flips back to false or
// the owning component unmounts, so a closed modal never intercepts Back for
// whatever screen is now underneath it.
function useBackHandler(active, onBack) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active) return;
    const handler = () => onBackRef.current();
    backHandlerStack.push(handler);
    return () => {
      const idx = backHandlerStack.lastIndexOf(handler);
      if (idx !== -1) backHandlerStack.splice(idx, 1);
    };
  }, [active]);
}

export function cleanGoogleImageUrl(url) {
  if (!url) return '';
  try {
    if (url.includes('google.') && url.includes('imgres')) {
      const parsed = new URL(url);
      if (parsed.searchParams.has('imgurl')) {
        return decodeURIComponent(parsed.searchParams.get('imgurl'));
      }
    }
  } catch (e) {
    // ignore
  }
  return url;
}

export const INDIAN_STATES_DISTRICTS = {
  "Andhra Pradesh": [
    "Anantapur", "Chittoor", "East Godavari", "Guntur", "Krishna", "Kurnool", 
    "Nellore", "Prakasam", "Srikakulam", "Visakhapatnam", "Vizianagaram", 
    "West Godavari", "YSR Kadapa", "Manyam", "Alluri Sitharama Raju", "Anakapalli", 
    "Kakinada", "Konaseema", "Eluru", "NTR", "Bapatla", "Palnadu", "Nandyal", 
    "Sri Sathya Sai", "Tirupati", "Annamayya"
  ],
  "Arunachal Pradesh": [
    "Tawang", "West Kameng", "East Kameng", "Papum Pare", "Kurung Kumey", 
    "Kra Daadi", "Lower Subansiri", "Upper Subansiri", "West Siang", "East Siang", 
    "Siang", "Upper Siang", "Lower Siang", "Lower Dibang Valley", "Dibang Valley", 
    "Anjaw", "Lohit", "Namsai", "Changlang", "Tirap", "Longding", "Kamle", "Pakke Kessang", "Leparada", "Shi Yomi"
  ],
  "Assam": [
    "Baksa", "Barpeta", "Biswanath", "Bongaigaon", "Cachar", "Charaideo", 
    "Chirang", "Darrang", "Dhemaji", "Dhubri", "Dibrugarh", "Dima Hasao", 
    "Goalpara", "Golaghat", "Hailakandi", "Hojai", "Jorhat", "Kamrup Metropolitan", 
    "Kamrup", "Karbi Anglong", "Karimganj", "Kokrajhar", "Lakhimpur", "Majuli", 
    "Morigaon", "Nagaon", "Nalbari", "Sivasagar", "Sonitpur", "South Salmara-Mankachar", 
    "Tinsukia", "Udalguri", "West Karbi Anglong", "Tamulpur", "Bajali"
  ],
  "Bihar": [
    "Araria", "Arwal", "Aurangabad", "Banka", "Begusarai", "Bhagalpur", 
    "Bhojpur", "Buxar", "Darbhanga", "East Champaran", "Gaya", "Gopalganj", 
    "Jamui", "Jehanabad", "Kaimur", "Katihar", "Khagaria", "Kishanganj", 
    "Lakhisarai", "Madhepura", "Madhubani", "Munger", "Muzaffarpur", "Nalanda", 
    "Nawada", "Patna", "Purnia", "Rohtas", "Saharsa", "Samastipur", 
    "Saran", "Sheikhpura", "Sheohar", "Sitamarhi", "Siwan", "Supaul", 
    "Vaishali", "West Champaran"
  ],
  "Chhattisgarh": [
    "Balod", "Baloda Bazar", "Balrampur", "Bastar", "Bemetara", "Bijapur", 
    "Bilaspur", "Dantewada", "Dhamtari", "Durg", "Gariaband", "Jashpur", 
    "Kabirdham", "Kanker", "Kondagaon", "Korba", "Koriya", "Mahasamund", 
    "Mungeli", "Narayanpur", "Raigarh", "Raipur", "Rajnandgaon", "Sukma", 
    "Surajpur", "Surguja", "Gaurela-Pendra-Marwahi", "Manendragarh-Chirmiri-Bharatpur", 
    "Mohla-Manpur-Ambagarh Chowki", "Sakti", "Sarangarh-Bilaigarh", "Khairagarh-Chhuikhadan-Gandai"
  ],
  "Goa": ["North Goa", "South Goa"],
  "Gujarat": [
    "Ahmedabad", "Amreli", "Anand", "Aravalli", "Banaskantha", "Bharuch", 
    "Bhavnagar", "Botad", "Chhota Udepur", "Dahod", "Dang", "Devbhumi Dwarka", 
    "Gandhinagar", "Gir Somnath", "Jamnagar", "Junagadh", "Kheda", "Kutch", 
    "Mahisagar", "Mehsana", "Morbi", "Narmada", "Navsari", "Panchmahal", 
    "Patan", "Porbandar", "Rajkot", "Sabarkantha", "Surat", "Surendranagar", 
    "Tapi", "Vadodara", "Valsad"
  ],
  "Haryana": [
    "Ambala", "Bhiwani", "Charkhi Dadri", "Faridabad", "Fatehabad", "Gurugram", 
    "Hisar", "Jhajjar", "Jind", "Kaithal", "Karnal", "Kurukshetra", 
    "Mahendragarh", "Nuh", "Palwal", "Panchkula", "Panipat", "Rewari", 
    "Rohtak", "Sirsa", "Sonipat", "Yamunanagar"
  ],
  "Himachal Pradesh": [
    "Bilaspur", "Chamba", "Hamirpur", "Kangra", "Kinnaur", "Kullu", 
    "Lahaul and Spiti", "Mandi", "Shimla", "Sirmaur", "Solan", "Una"
  ],
  "Jharkhand": [
    "Bokaro", "Chatra", "Deoghar", "Dhanbad", "Dumka", "East Singhbhum", 
    "Garhwa", "Giridih", "Godda", "Gumla", "Hazaribagh", "Jamtara", 
    "Khunti", "Koderma", "Latehar", "Lohardaga", "Pakur", "Palamu", 
    "Ramgarh", "Ranchi", "Sahibganj", "Seraikela Kharsawan", "Simdega", "West Singhbhum"
  ],
  "Karnataka": [
    "Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban", 
    "Bidar", "Chamarajanagar", "Chikkaballapur", "Chikkamagaluru", "Chitradurga", 
    "Dakshina Kannada", "Davanagere", "Dharwad", "Gadag", "Hassan", 
    "Haveri", "Kalaburagi", "Kodagu", "Kolar", "Koppal", "Mandya", 
    "Mysuru", "Raichur", "Ramanagara", "Shivamogga", "Tumakuru", "Udupi", 
    "Uttara Kannada", "Vijayapura", "Yadgir", "Vijayanagara"
  ],
  "Kerala": [
    "Alappuzha", "Ernakulam", "Idukki", "Kannur", "Kasaragod", "Kollam", 
    "Kottayam", "Kozhikode", "Malappuram", "Palakkad", "Pathanamthitta", 
    "Thiruvananthapuram", "Thrissur", "Wayanad"
  ],
  "Madhya Pradesh": [
    "Agar Malwa", "Alirajpur", "Anuppur", "Ashoknagar", "Balaghat", "Barwani", 
    "Betul", "Bhind", "Bhopal", "Burhanpur", "Chhatarpur", "Chhindwara", 
    "Damoh", "Datia", "Dewas", "Dhar", "Dindori", "Guna", "Gwalior", 
    "Harda", "Narmadapuram", "Indore", "Jabalpur", "Jhabua", "Katni", 
    "Khandwa", "Khargone", "Mandla", "Mandsaur", "Morena", "Narsinghpur", 
    "Neemuch", "Niwari", "Panna", "Raisen", "Rajgarh", "Ratlam", 
    "Rewa", "Sagar", "Satna", "Sehore", "Seoni", "Shahdol", "Shajapur", 
    "Sheopur", "Shivpuri", "Sidhi", "Singrauli", "Tikamgarh", "Ujjain", 
    "Umaria", "Vidisha", "Mauganj"
  ],
  "Maharashtra": [
    "Ahmednagar", "Akola", "Amravati", "Aurangabad", "Beed", "Bhandara", 
    "Buldhana", "Chandrapur", "Dhule", "Gadchiroli", "Gondia", "Hingoli", 
    "Jalgaon", "Jalna", "Kolhapur", "Latur", "Mumbai City", "Mumbai Suburban", 
    "Nagpur", "Nanded", "Nandurbar", "Nashik", "Osmanabad", "Palghar", 
    "Parbhani", "Pune", "Raigad", "Ratnagiri", "Sangli", "Satara", 
    "Sindhudurg", "Solapur", "Thane", "Wardha", "Washim", "Yavatmal"
  ],
  "Manipur": [
    "Bishnupur", "Chandel", "Churachandpur", "Imphal East", "Imphal West", 
    "Senapati", "Tamenglong", "Thoubal", "Ukhrul", "Kangpokpi", "Tengnoupal", 
    "Pherzawl", "Noney", "Kamjong", "Kakching", "Jiribam"
  ],
  "Meghalaya": [
    "East Garo Hills", "East Jaintia Hills", "East Khasi Hills", "North Garo Hills", 
    "Ri Bhoi", "South Garo Hills", "South West Garo Hills", "South West Khasi Hills", 
    "West Garo Hills", "West Jaintia Hills", "West Khasi Hills", "Eastern West Khasi Hills"
  ],
  "Mizoram": [
    "Aizawl", "Champhai", "Kolasib", "Lawngtlai", "Lunglei", "Mamit", 
    "Saiha", "Serchhip", "Hnahthial", "Khawzawl", "Saitual"
  ],
  "Nagaland": [
    "Dimapur", "Kiphire", "Kohima", "Longleng", "Mokokchung", "Mon", 
    "Peren", "Phek", "Tuensang", "Wokha", "Zunheboto", "Noklak", 
    "Chümoukedima", "Tseminyu", "Niuland", "Shamator"
  ],
  "Odisha": [
    "Angul", "Balangir", "Balasore", "Bargarh", "Bhadrak", "Boudh", 
    "Cuttack", "Deogarh", "Dhenkanal", "Gajapati", "Ganjam", "Jagatsinghpur", 
    "Jajpur", "Jharsuguda", "Kalahandi", "Kandhamal", "Kendrapara", "Keonjhar", 
    "Khordha", "Koraput", "Malkangiri", "Mayurbhanj", "Nabarangpur", "Nayagarh", 
    "Nuapada", "Puri", "Rayagada", "Sambalpur", "Subarnapur", "Sundargarh"
  ],
  "Punjab": [
    "Amritsar", "Barnala", "Bathinda", "Faridkot", "Fatehgarh Sahib", "Fazilka", 
    "Ferozepur", "Gurdaspur", "Hoshiarpur", "Jalandhar", "Kapurthala", 
    "Ludhiana", "Malerakotla", "Mansa", "Moga", "Muktsar", "Pathankot", 
    "Patiala", "Rupnagar", "Sahibzada Ajit Singh Nagar", "Sangrur", 
    "Shahid Bhagat Singh Nagar", "Tarn Taran"
  ],
  "Rajasthan": [
    "Ajmer", "Alwar", "Banswara", "Baran", "Barmer", "Bharatpur", 
    "Bhilwara", "Bikaner", "Bundi", "Chittorgarh", "Churu", "Dausa", 
    "Dholpur", "Dungarpur", "Hanumangarh", "Jaipur", "Jaisalmer", "Jalore", 
    "Jhalawar", "Jhunjhunu", "Jodhpur", "Karauli", "Kota", "Nagaur", 
    "Pali", "Pratapgarh", "Rajsamand", "Sawai Madhopur", "Sikar", "Sirohi", 
    "Sri Ganganagar", "Tonk", "Udaipur", "Anoopgarh", "Balotra", "Beawar", 
    "Deeg", "Didwana-Kuchaman", "Dudu", "Gangapur City", "Kekri", 
    "Kotputli-Behror", "Khairthal-Tijara", "Neem Ka Thana", "Phalodi", 
    "Salumber", "Sanchore", "Shahpura"
  ],
  "Sikkim": ["East Sikkim", "North Sikkim", "South Sikkim", "West Sikkim", "Pakyong", "Soreng"],
  "Tamil Nadu": [
    "Ariyalur", "Chengalpattu", "Chennai", "Coimbatore", "Cuddalore", "Dharmapuri", 
    "Dindigul", "Erode", "Kallakurichi", "Kanchipuram", "Kanyakumari", "Karur", 
    "Krishnagiri", "Madurai", "Mayiladuthurai", "Nagapattinam", "Namakkal", "Nilgiris", 
    "Perambalur", "Pudukkottai", "Ramanathapuram", "Ranipet", "Salem", "Sivaganga", 
    "Tenkasi", "Thanjavur", "Theni", "Thoothukudi", "Tiruchirappalli", "Tirunelveli", 
    "Tirupathur", "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur", "Vellore", 
    "Viluppuram", "Virudhunagar"
  ],
  "Telangana": [
    "Adilabad", "Bhadradri Kothagudem", "Hyderabad", "Jagtial", "Jangaon", 
    "Jayashankar Bhupalpally", "Jogulamba Gadwal", "Kamareddy", "Karimnagar", 
    "Khammam", "Kumuram Bheem", "Mahabubabad", "Mahabubnagar", "Mancherial", 
    "Medak", "Medchal-Malkajgiri", "Mulugu", "Nagarkurnool", "Nalgonda", 
    "Narayanpet", "Nirmal", "Nizamabad", "Peddapalli", "Rajanna Sircilla", 
    "Rangareddy", "Sangareddy", "Siddipet", "Suryapet", "Vikarabad", 
    "Wanaparthy", "Warangal", "Hanamkonda", "Yadadri Bhuvanagiri"
  ],
  "Tripura": [
    "Dhalai", "Gomati", "Khowai", "North Tripura", "Sepahijala", "South Tripura", 
    "Unakoti", "West Tripura"
  ],
  "Uttar Pradesh": [
    "Agra", "Aligarh", "Ambedkar Nagar", "Amethi", "Amroha", "Auraiya", 
    "Ayodhya", "Azamgarh", "Baghpat", "Bahraich", "Ballia", "Balrampur", 
    "Banda", "Bara Banki", "Bareilly", "Basti", "Bhadohi", "Bijnor", 
    "Budaun", "Bulandshahr", "Chandauli", "Chitrakoot", "Deoria", "Etah", 
    "Etawah", "Farrukhabad", "Fatehpur", "Firozabad", "Gautam Buddha Nagar", 
    "Ghaziabad", "Ghazipur", "Gonda", "Gorakhpur", "Hamirpur", "Hapur", 
    "Hardoi", "Hathras", "Jalaun", "Jaunpur", "Jhansi", "Kannauj", 
    "Kanpur Dehat", "Kanpur Nagar", "Kasganj", "Kaushambi", "Kheri", 
    "Kushinagar", "Lalitpur", "Lucknow", "Maharajganj", "Mahoba", "Mainpuri", 
    "Mathura", "Mau", "Meerut", "Mirzapur", "Moradabad", "Muzaffarnagar", 
    "Pilibhit", "Pratapgarh", "Prayagraj", "Rae Bareli", "Rampur", 
    "Saharanpur", "Sambhal", "Sant Kabir Nagar", "Shahjahanpur", "Shamli", 
    "Shravasti", "Siddharthnagar", "Sitapur", "Sonbhadra", "Sultanpur", 
    "Unnao", "Varanasi"
  ],
  "Uttarakhand": [
    "Almora", "Bageshwar", "Chamoli", "Champawat", "Dehradun", "Haridwar", 
    "Nainital", "Pauri Garhwal", "Pithoragarh", "Rudraprayag", "Tehri Garhwal", 
    "Udham Singh Nagar", "Uttarkashi"
  ],
  "West Bengal": [
    "Alipurduar", "Bankura", "Birbhum", "Cooch Behar", "Dakshin Dinajpur", 
    "Darjeeling", "Hooghly", "Howrah", "Jalpaiguri", "Jhargram", 
    "Kalimpong", "Kolkata", "Malda", "Murshidabad", "Nadia", "North 24 Parganas", 
    "Paschim Bardhaman", "Paschim Medinipur", "Purba Bardhaman", "Purba Medinipur", 
    "Purulia", "South 24 Parganas", "Uttar Dinajpur"
  ]
};

export const PHONE_REGEX = /^[1-9]\d{9}$/;
export const PHONE_REGEX_MESSAGE = 'Phone number must be exactly 10 digits and cannot start with 0';

function CountUp({ value, decimals = 0, prefix = '', suffix = '', duration = 900 }) {
  const [display, setDisplay] = useState(0);
  const prevValue = useRef(0);

  useEffect(() => {
    const start = prevValue.current;
    const end = Number(value) || 0;
    const startTime = performance.now();
    let raf;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      setDisplay(end);
      prevValue.current = end;
    };
    const tick = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + (end - start) * eased);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        finish();
      }
    };
    raf = requestAnimationFrame(tick);
    // requestAnimationFrame is throttled/suspended entirely in background or
    // inactive tabs, which would leave the counter stuck at its start value
    // forever — this timer is a safety net that forces the final value in.
    const fallback = setTimeout(finish, duration + 250);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
    };
  }, [value, duration]);

  return <>{prefix}{display.toFixed(decimals)}{suffix}</>;
}

export const compressBase64Image = (base64, callback) => {
  if (!base64) {
    callback('');
    return;
  }
  if (!base64.startsWith('data:image')) {
    // PDFs (and any other non-image upload) are passed through unmodified —
    // the canvas resize below only applies to raster images.
    callback(base64);
    return;
  }
  const img = new Image();
  img.src = base64;
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const MAX_WIDTH = 120;
    const MAX_HEIGHT = 120;
    let width = img.width;
    let height = img.height;
    if (width > height) {
      if (width > MAX_WIDTH) {
        height *= MAX_WIDTH / width;
        width = MAX_WIDTH;
      }
    } else {
      if (height > MAX_HEIGHT) {
        width *= MAX_HEIGHT / height;
        height = MAX_HEIGHT;
      }
    }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    callback(canvas.toDataURL('image/jpeg', 0.5));
  };
  img.onerror = () => {
    callback(base64);
  };
};

const LANGUAGES = {
  en: {
    shopsRegistered: 'Shops Registered',
    complianceRegistry: 'Compliance Registry',
    hostStorage: 'Host Storage Pool',
    annualRevenue: 'Annual Revenue',
    provisionNewShop: 'Provision New Shop',
    inventoryStock: 'Inventory Stock',
    incomingOrders: 'Incoming Orders Log',
    dashboard: 'Dashboard',
    shops: 'Shop Management',
    customers: 'Customer Registry',
    keys: 'Master Catalogue',
    pricing: 'Pricing & Offers',
    revenue: 'Revenue Log',
    searchKeys: 'Blank Key Search',
    register: 'Register Customer',
    history: 'Customer History',
    store: 'Platform Store',
    reports: 'Reports',
    settings: 'Shop Settings',
    logout: 'Log Out',
    welcome: 'KEY SHOP WORKSPACE',
    superAdmin: 'Super Admin',
    shopTerminal: 'Shop Terminal',
  },
  hi: {
    shopsRegistered: 'पंजीकृत दुकानें',
    complianceRegistry: 'अनुपालन रजिस्ट्री',
    hostStorage: 'होस्ट स्टोरेज पूल',
    annualRevenue: 'वार्षिक राजस्व',
    provisionNewShop: 'नई दुकान का प्रावधान',
    inventoryStock: 'इन्वेंटरी स्टॉक',
    incomingOrders: 'आने वाले ऑर्डर लॉग',
    dashboard: 'डैशबोर्ड',
    shops: 'दुकान प्रबंधन',
    customers: 'ग्राहक रजिस्ट्री',
    keys: 'मास्टर सूची',
    pricing: 'मूल्य निर्धारण और ऑफ़र',
    revenue: 'राजस्व लॉग',
    searchKeys: 'खाली कुंजी खोज',
    register: 'ग्राहक पंजीकृत करें',
    history: 'ग्राहक इतिहास',
    store: 'प्लेटफ़ॉर्म स्टोर',
    reports: 'रिपोर्ट',
    settings: 'दुकान सेटिंग्स',
    logout: 'लॉग आउट',
    welcome: 'की वर्कस्पेस',
    superAdmin: 'सुपर एडमिन',
    shopTerminal: 'दुकान टर्मिनल',
  },
  ta: {
    shopsRegistered: 'பதிவு செய்யப்பட்ட கடைகள்',
    complianceRegistry: 'வாடிக்கையாளர் பதிவேடு',
    hostStorage: 'சேமிப்பகக் குளம்',
    annualRevenue: 'வருடாந்திர வருவாய்',
    provisionNewShop: 'புதிய கடை சேர்க்க',
    inventoryStock: 'சரக்கு இருப்பு',
    incomingOrders: 'உள்வரும் ஆர்டர்கள் பதிவு',
    dashboard: 'முகப்பு பலகை',
    shops: 'கடை மேலாண்மை',
    customers: 'வாடிக்கையாளர் பதிவேடு',
    keys: 'மாஸ்டர் பட்டியல்',
    pricing: 'விலை மற்றும் சலுகைகள்',
    revenue: 'வருவாய் பதிவு',
    searchKeys: 'வெற்று சாவி தேடல்',
    register: 'வாடிக்கையாளர் பதிவு',
    history: 'பதிவு வரலாறு',
    store: 'விற்பனை நிலையம்',
    reports: 'அறிக்கைகள்',
    settings: 'கடை அமைப்புகள்',
    logout: 'வெளியேறு',
    welcome: 'கீ ஒர்க்ஸ்பேஸ்',
    superAdmin: 'சூப்பர் அட்மின்',
    shopTerminal: 'கடை முனையம்',
  },
  te: {
    shopsRegistered: 'నమోదిత దుకాణాలు',
    complianceRegistry: 'కస్టమర్ రిజిస్ట్రీ',
    hostStorage: 'హోస్ట్ నిల్వ పూల్',
    annualRevenue: 'వార్షിക ఆదాయం',
    provisionNewShop: 'కొత్త దుకాణం ఏర్పాటు',
    inventoryStock: 'ఇన్వెంటరీ స్టాక్',
    incomingOrders: 'ఇన్‌కమింగ్ ఆర్డర్‌ల లాగ్',
    dashboard: 'డాష్‌బోర్డ్',
    shops: 'షాప్ మేనేజ్‌మెంట్',
    customers: 'కస్టమర్ రిజిస్ట్రీ',
    keys: 'మాస్టர் కేటలాగ్',
    pricing: 'ధరలు & ఆఫర్లు',
    revenue: 'ఆదాయ లాగ్',
    searchKeys: 'కీ శోధన',
    register: 'కస్టమర్ నమోదు',
    history: 'కస్టమర్ చరిత్ర',
    store: 'ప్లాట్‌ఫారమ్ స్టోర్',
    reports: 'निवेदिकलु',
    settings: 'షాప్ సెట్టింగులు',
    logout: 'లాగ్ అవుట్',
    welcome: 'కీ వర్క్‌స్పేస్',
    superAdmin: 'సూపర్ అడ్మిన్',
    shopTerminal: 'షాప్ టెర్మినల్',
  },
  kn: {
    shopsRegistered: 'ನೋಂದಾಯಿತ ಅಂಗಡಿಗಳು',
    complianceRegistry: 'ಗ್ರಾಹಕರ ನೋಂದಣಿ',
    hostStorage: 'ಹೋಸ್ಟ್ ಶೇಖರಣಾ ಪೂಲ್',
    annualRevenue: 'ವಾರ್ಷಿಕ ಆದಾಯ',
    provisionNewShop: 'ಹೊಸ ಅಂಗಡಿ ಸೇರಿಸಿ',
    inventoryStock: 'ದಾಸ್ತಾನು ಸ್ಟಾಕ್',
    incomingOrders: 'ಒಳಬರುವ ಆದೇಶಗಳ ಲಾಗ್',
    dashboard: 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್',
    shops: 'ಅಂಗಡಿ ನಿರ್ವಹಣೆ',
    customers: 'ಗ್ರಾಹಕರ ನೋಂದಣಿ',
    keys: 'ಮಾಸ್ಟರ್ ಕ್ಯಾಟಲಾಗ್',
    pricing: 'ಬೆಲೆ ಮತ್ತು ಕೊಡುಗೆಗಳು',
    revenue: 'ಆದಾಯ ದಾಖಲೆ',
    searchKeys: 'ಖಾಲಿ ಕೀಲಿ ಹುಡುಕಾಟ',
    register: 'ಗ್ರಾಹಕ ನೋಂದಣಿ',
    history: 'ಗ್ರಾಹಕ ಇತಿಹಾಸ',
    store: 'ಪ್ಲಾಟ್‌ಫಾರ್ಮ್ ಸ್ಟೋರ್',
    reports: 'ವರದಿಗಳು',
    settings: 'ಅಂಗಡಿ ಸೆಟ್ಟಿಂಗ್‌ಗಳು',
    logout: 'ಲಾಗ್ ಔಟ್',
    welcome: 'ಕೀ ವರ್ಕ್‌ಸ್ಪೇಸ್',
    superAdmin: 'ಸೂಪರ್ ಅಡ್ಮಿನ್',
    shopTerminal: 'ಅಂಗಡಿ ಟರ್ಮಿನಲ್',
  },
  ml: {
    shopsRegistered: 'രജിസ്റ്റർ ചെയ്ത കടകൾ',
    complianceRegistry: 'കസ്റ്റമർ രജിസ്ട്രി',
    hostStorage: 'ഹോസ്റ്റ് സംഭരണ പൂൾ',
    annualRevenue: 'വാർഷിക വരുമാനം',
    provisionNewShop: 'പുതിയ ഷോപ്പ് ചേർക്കുക',
    inventoryStock: 'ഇൻവെന്ററി സ്റ്റോക്ക്',
    incomingOrders: 'ഇൻകമിംഗ് ഓർഡറുകൾ',
    dashboard: 'ഡാഷ്‌ബോർഡ്',
    shops: 'ഷോപ്പ് മാനേജ്‌മെന്റ്',
    customers: 'കസ്റ്റമർ രജിസ്ട്രി',
    keys: 'മാസ്റ്റർ കാറ്റലോഗ്',
    pricing: 'വിലയും ഓഫറുകളും',
    revenue: 'വരുമാന ലോഗ്',
    searchKeys: 'ബ്ലാങ്ക് കീ സെർച്ച്',
    register: 'കസ്റ്റമർ രജിസ്റ്റർ',
    history: 'കസ്റ്റമർ ഹിസ്റ്ററി',
    store: 'പ്ലാറ്റ്ഫോം സ്റ്റോർ',
    reports: 'റിപ്പോർട്ടുകൾ',
    settings: 'ഷോപ്പ് ക്രമീകരണങ്ങൾ',
    logout: 'ലോഗ് ഔട്ട്',
    welcome: 'കീ വർക്ക്സ്പേസ്',
    superAdmin: 'സൂപ്പർ അഡ്മിൻ',
    shopTerminal: 'ഷോപ്പ് ടെർമിനൽ',
  }
};

// Global header search "search by" categories. Rendered via a custom
// icon-based dropdown (not a native <select>) so the closed/trigger state
// can collapse to an icon-only button on mobile while still showing a full
// icon+label list in the open dropdown on every screen size.
const SEARCH_TYPE_OPTIONS = [
  { value: 'all', label: 'Anything', icon: Search },
  { value: 'customer', label: 'Customer', icon: Users },
  { value: 'productType', label: 'Product Type', icon: Tag },
  { value: 'location', label: 'Location', icon: MapPin },
  { value: 'key', label: 'Key', icon: KeyRound },
];

// Icon + label shown on each row of the global search "results overview"
// list, keyed by the entity type of that result (see the multi-entity
// search effect below). Every entity type the global search can return
// must have an entry here.
const GLOBAL_SEARCH_RESULT_META = {
  customer: { label: 'Customer', icon: Users },
  key: { label: 'Key', icon: KeyRound },
  shop: { label: 'Shop', icon: Store },
  product: { label: 'Product', icon: Tag },
};

// True only when running inside the native Android/iOS shell (Capacitor),
// never in a regular desktop/mobile browser. Used to skip the marketing
// landing page (PublicSite) for the packaged app and drop straight into the
// login screen, since a native app has no reason to show a browsable
// marketing site before sign-in.
const IS_NATIVE_APP = Capacitor.isNativePlatform();

// Shared "Current Location" resolver used by both the Shop Registration wizard
// (captureShopLocation) and the Customer Registration wizard
// (captureCustomerLocation). Centralizing this means both flows enforce the
// exact same permission/GPS-availability checks:
//   1. Check whether location permission is already granted.
//   2. If not, prompt the OS permission dialog (native only - on web the
//      browser's own permission prompt fires automatically the first time
//      getCurrentPosition() is called, so there's nothing to request upfront).
//   3. If the user denies permission, reject with kind: 'permission'.
//   4. If permission is granted but device location services (GPS) are
//      switched off, reject with kind: 'disabled'.
//   5. Otherwise resolve the device's actual current GPS coordinates.
//
// A single getCurrentPosition() call (even with enableHighAccuracy) often
// returns a coarse, network/cell-tower-based fix instead of a real GPS lock
// - especially right after the app opens, before the GPS chip has warmed
// up, which is what made "current location" land hundreds of meters off.
// So instead we sample multiple updates via watchPosition() for up to ~9s
// and keep whichever reading has the smallest accuracy radius, resolving
// early the moment a good-enough fix (<=20m accuracy) comes in.
function classifyLocationError(e) {
  const msg = ((e && e.message) || '').toLowerCase();
  if ((e && e.code === 1) || msg.includes('permission') || msg.includes('denied')) {
    const err = new Error('Location permission is required to capture your current location.');
    err.kind = 'permission';
    return err;
  }
  if (msg.includes('not enabled') || msg.includes('disabled') || msg.includes('location services') || msg.includes('turned off')) {
    const err = new Error('Please enable Location Services to capture your current location.');
    err.kind = 'disabled';
    return err;
  }
  const err = new Error('Unable to fetch current location. Please allow location access or enter the address manually.');
  err.kind = 'unavailable';
  return err;
}

async function resolveCurrentLocation() {
  const { Geolocation } = await import('@capacitor/geolocation');

  if (IS_NATIVE_APP) {
    let status;
    try {
      status = await Geolocation.checkPermissions();
    } catch (e) {
      status = { location: 'prompt', coarseLocation: 'prompt' };
    }
    if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
      try {
        status = await Geolocation.requestPermissions();
      } catch (e) {
        const err = new Error('Location permission is required to capture your current location.');
        err.kind = 'permission';
        throw err;
      }
    }
    if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
      const err = new Error('Location permission is required to capture your current location.');
      err.kind = 'permission';
      throw err;
    }
  }

  return new Promise((resolve, reject) => {
    let best = null;
    let watchId = null;
    let settled = false;
    let fallbackError = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (watchId != null) {
        Geolocation.clearWatch({ id: watchId }).catch(() => {});
      }
      if (best) {
        resolve({ lat: best.coords.latitude, lng: best.coords.longitude, accuracy: best.coords.accuracy });
      } else {
        reject(fallbackError || classifyLocationError(new Error('unavailable')));
      }
    };

    const timer = setTimeout(finish, 9000);

    Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }, (pos, err) => {
      if (err) {
        fallbackError = classifyLocationError(err);
        return;
      }
      if (pos && (!best || pos.coords.accuracy < best.coords.accuracy)) {
        best = pos;
      }
      if (pos && pos.coords.accuracy <= 20) {
        finish();
      }
    }).then((id) => {
      watchId = id;
    }).catch((e) => {
      fallbackError = classifyLocationError(e);
      finish();
    });
  });
}

// Reverse-geocodes GPS coordinates into a structured, street-level address
// via our own backend (see backend/src/geo/geo.controller.ts) rather than
// calling a third-party geocoder directly from the client. Nominatim
// (OpenStreetMap), which is what actually returns house number / road
// detail, doesn't send CORS headers for direct browser/WebView requests -
// routing through our backend sidesteps that. Returns null on any failure
// so callers can fall back to raw coordinates.
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`${API_BASE}/api/geo/reverse-geocode?lat=${lat}&lng=${lng}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('Reverse geocoding failed:', e);
    return null;
  }
}

// Opens the device's native location-settings screen (Android/iOS only - a
// no-op on web, where there's no equivalent OS settings screen to deep-link
// to). Used by the "Enable Location Services" prompt shown when GPS is off.
async function openDeviceLocationSettings() {
  if (!IS_NATIVE_APP) return;
  try {
    const { NativeSettings, AndroidSettings, IOSSettings } = await import('capacitor-native-settings');
    await NativeSettings.open({ optionAndroid: AndroidSettings.Location, optionIOS: IOSSettings.LocationServices });
  } catch (e) {
    console.warn('Could not open device location settings:', e);
  }
}

// Opens this app's own OS permission/settings page (not a specific settings
// category like location above). This is the only way for a user to recover
// from a "permanently denied" (Android "Don't ask again") runtime permission
// - once that state is hit, requestPermissions() resolves as denied instantly
// without ever showing the OS prompt again, so the app has to hand the user
// off to Settings > Apps > Key Shop > Permissions manually.
async function openAppSettings() {
  if (!IS_NATIVE_APP) return;
  try {
    const { NativeSettings, AndroidSettings, IOSSettings } = await import('capacitor-native-settings');
    await NativeSettings.open({ optionAndroid: AndroidSettings.ApplicationDetails, optionIOS: IOSSettings.App });
  } catch (e) {
    console.warn('Could not open app settings:', e);
  }
}

// Shared Camera-access resolver, mirroring resolveCurrentLocation() above -
// verifies/requests camera permission before the webcam capture steps in the
// Shop/Customer Registration wizards, classifying failures the same way
// (err.kind = 'permission' | 'unavailable') so the UI can show consistent,
// non-blocking guidance instead of a native alert() dialog.
//
// There's no separate "check without prompting" step here the way
// Geolocation.checkPermissions() provides: getUserMedia() itself is both the
// check AND the request in one call (the browser/WebView shows its own
// permission prompt the first time, and instantly rejects on subsequent
// calls if the user already denied it) - so this just wraps that call with
// the same error classification used elsewhere in the app.
async function resolveCameraAccess() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const err = new Error('Camera capture is not supported on this device/browser. Please upload a photo instead.');
    err.kind = 'unavailable';
    throw err;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    return stream;
  } catch (e) {
    const name = (e && e.name) || '';
    if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
      const err = new Error('Camera permission is required to take a photo. Please allow camera access, or upload a photo instead.');
      err.kind = 'permission';
      throw err;
    }
    const err = new Error('Camera is unavailable right now. Please upload a photo instead.');
    err.kind = 'unavailable';
    throw err;
  }
}

// Best-effort, non-blocking storage/media permission priming before opening
// a document/photo picker (native Android only - iOS's photo picker and the
// web <input type=file> UI never need an explicit runtime permission
// request). Deliberately never throws or blocks the picker from opening:
// on modern Android (13+) gallery access goes through the permission-less
// system Photo Picker / Storage Access Framework, so this is a courtesy
// request for older OS versions rather than a hard gate.
async function primeStoragePermission() {
  if (!IS_NATIVE_APP) return;
  try {
    const { Filesystem } = await import('@capacitor/filesystem');
    const status = await Filesystem.checkPermissions();
    if (status.publicStorage !== 'granted') {
      await Filesystem.requestPermissions();
    }
  } catch (e) {
    console.warn('Storage permission priming skipped:', e);
  }
}

export default function App() {
  const { user, isAuthenticated, loading, login, logout, api } = useAuth();
  const [lang, setLang] = useState(localStorage.getItem('kee_lang') || 'en');
  const t = (key) => LANGUAGES[lang]?.[key] || LANGUAGES['en']?.[key] || key;

  // Navigation stack for proper Android Back button / back-swipe-gesture
  // support. This app has no router (activeTab is a flat string, switched by
  // conditional rendering below) so the WebView's own history stack stays
  // empty - Capacitor's default back handling then has nothing to "go back"
  // to and just exits the app immediately from any screen. `navStack` tracks
  // the trail of previously-visited tabs so Back can step through it instead.
  // `setActiveTab` below replaces the raw setter everywhere it's already
  // used/passed as a prop (28+ call sites, including deep in child views via
  // `setActiveTab={setActiveTab}`) without needing to touch any of them.
  const [activeTab, setActiveTabRaw] = useState('dashboard');
  const [navStack, setNavStack] = useState([]);

  const setActiveTab = (nextTab) => {
    setActiveTabRaw((current) => {
      if (current === nextTab) return current;
      setNavStack((stack) => [...stack, current]);
      return nextTab;
    });
  };

  // Explicit "go home" - used by the Dashboard entries in the side-nav and
  // mobile bottom-nav. Clears the trail instead of pushing onto it, so
  // Dashboard genuinely behaves as the app's root: Back from Dashboard means
  // "exit", never "go back into whatever screen I was on before I tapped
  // Dashboard".
  const resetToDashboard = () => {
    setNavStack([]);
    setActiveTabRaw('dashboard');
  };

  // Pops one entry off the nav stack and returns to it. If the stack is
  // already empty (e.g. the very first screen after login), falls back to
  // Dashboard rather than doing nothing.
  const goBack = () => {
    setNavStack((stack) => {
      if (stack.length === 0) {
        setActiveTabRaw('dashboard');
        return stack;
      }
      setActiveTabRaw(stack[stack.length - 1]);
      return stack.slice(0, -1);
    });
  };

  // "Press Back again to exit" state - only ever shown while already on the
  // Dashboard/home screen (see the backButton listener below).
  const [exitPromptVisible, setExitPromptVisible] = useState(false);

  useEffect(() => {
    if (!IS_NATIVE_APP) return;
    let exitArmed = false;
    let exitTimer = null;

    const listenerHandle = CapacitorApp.addListener('backButton', () => {
      // Any open modal/dialog/in-progress wizard step always wins first -
      // Back should close/step that back before ever touching screen
      // navigation underneath it.
      if (backHandlerStack.length > 0) {
        setExitPromptVisible(false);
        backHandlerStack[backHandlerStack.length - 1]();
        return;
      }

      if (activeTab !== 'dashboard') {
        setExitPromptVisible(false);
        goBack();
        return;
      }

      // Already on Dashboard/Home: standard Android double-back-to-exit.
      if (exitArmed) {
        CapacitorApp.exitApp();
        return;
      }
      exitArmed = true;
      setExitPromptVisible(true);
      exitTimer = setTimeout(() => {
        exitArmed = false;
        setExitPromptVisible(false);
      }, 2000);
    });

    return () => {
      clearTimeout(exitTimer);
      listenerHandle.then((l) => l.remove()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, navStack]);

  // Shop Admin's workspace name, shown as the header page title on every
  // screen except Dashboard (which shows the live search box instead). Fetched
  // once via the existing shop-settings endpoint - Super Admin has no shop, so
  // the header falls back to the static "Key Shop" brand name for that role instead.
  const [shopDisplayName, setShopDisplayName] = useState('');
  useEffect(() => {
    if (!isAuthenticated || user?.role === 'SUPER_ADMIN') return;
    let cancelled = false;
    api.getSettings()
      .then((res) => { if (!cancelled) setShopDisplayName(res?.name || ''); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.role]);

  // First-launch runtime permission priming (native app only). Proactively
  // asks for Location, Camera and Storage/Media up front, once per device,
  // right after the user logs in for the first time - rather than only ever
  // surfacing each OS prompt reactively the first time a registration wizard
  // happens to need it. This is purely best-effort priming: every individual
  // flow (GPS capture, webcam capture, file pickers) still runs its own
  // check/request via resolveCurrentLocation()/resolveCameraAccess()/
  // primeStoragePermission() at the point of use, so declining here (or the
  // OS never showing a prompt because a permission is already
  // granted/denied) never blocks the app - it just means the user sees the
  // same prompt again later, in context, when they actually tap a
  // location/camera/upload action. Guarded by a localStorage flag so it only
  // ever runs once per install, not on every login.
  useEffect(() => {
    if (!IS_NATIVE_APP || !isAuthenticated) return;
    if (localStorage.getItem('kee_permissions_primed')) return;
    localStorage.setItem('kee_permissions_primed', '1');

    (async () => {
      // Location
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        const status = await Geolocation.checkPermissions().catch(() => ({ location: 'prompt' }));
        if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
          await Geolocation.requestPermissions().catch(() => {});
        }
      } catch (e) {
        console.warn('Location permission priming skipped:', e);
      }

      // Camera - getUserMedia() both checks and requests in one call; stop
      // the stream immediately since this is only priming the OS permission,
      // not actually capturing anything yet.
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
          stream.getTracks().forEach(track => track.stop());
        }
      } catch (e) {
        console.warn('Camera permission priming skipped:', e);
      }

      // Storage/Media
      await primeStoragePermission();
    })();
  }, [isAuthenticated]);

  // Global header search: replaces the plain page-title label with a
  // functional search box + category filter. Typing never navigates away by
  // itself - regardless of which "search by" filter is selected, every
  // keystroke (debounced) queries every searchable entity type in parallel
  // (customers, keys, shops, inventory products) and renders a "results
  // overview" dropdown right under the search box. The selected filter no
  // longer restricts *what* is searched (per product requirement: "regardless
  // of the selected filter... return all relevant results") - it's kept only
  // as a UX hint (placeholder text / icon). Navigation to the owning screen
  // happens only when the user taps one specific result, via the same
  // `searchDispatch` ({query, type, nonce}) hand-off screens already listen
  // for, seeded with that result's own identifying text so the destination
  // screen lands pre-filtered to just that record.
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchType, setGlobalSearchType] = useState('all');
  const [globalSearchResults, setGlobalSearchResults] = useState([]);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const [searchDispatch, setSearchDispatch] = useState(null);
  const [searchTypeMenuOpen, setSearchTypeMenuOpen] = useState(false);

  useEffect(() => {
    // The global search box only exists on the Dashboard (see the header
    // JSX below).
    if (activeTab !== 'dashboard') return;
    const query = globalSearchQuery.trim();
    if (query.length < 2) {
      setGlobalSearchResults([]);
      setGlobalSearchLoading(false);
      return;
    }

    const isSuper = user?.role === 'SUPER_ADMIN';
    const q = query.toLowerCase();
    let cancelled = false;
    setGlobalSearchLoading(true);

    const timer = setTimeout(() => {
      const tasks = [];

      // Customers - server-side filtered by name/phone/etc.
      tasks.push(
        (isSuper ? api.getSuperCustomers(query) : api.getCustomers(query))
          .then(list => (list || []).map(c => ({
            type: 'customer',
            key: `customer-${c.id}`,
            title: c.name,
            line2: c.phone,
            line3: isSuper ? (c.shop?.name || '') : '',
            searchTerm: c.phone || c.name,
          })))
          .catch(() => [])
      );

      // Master keys - server-side filtered by keyNumber/category.
      tasks.push(
        api.getMasterKeys(query)
          .then(list => (list || []).map(k => ({
            type: 'key',
            key: `key-${k.id}`,
            title: k.keyNumber,
            line2: k.category || '',
            line3: k.shop?.name || (!isSuper ? (shopDisplayName || '') : ''),
            searchTerm: k.keyNumber,
          })))
          .catch(() => [])
      );

      // Shops - Super Admin only, filtered client-side (no search param on this endpoint).
      if (isSuper) {
        tasks.push(
          api.getShops()
            .then(list => (list || [])
              .filter(s => (s.name || '').toLowerCase().includes(q))
              .map(s => {
                let phone = '';
                try { phone = s.companyDetails ? (JSON.parse(s.companyDetails).phone || '') : ''; } catch (e) {}
                return {
                  type: 'shop',
                  key: `shop-${s.id}`,
                  title: s.name,
                  // The Shop model has no shopCode/slug field - fall back to a
                  // short, stable ID fragment as the secondary identifier.
                  line2: `ID: ${s.id.slice(0, 8).toUpperCase()}`,
                  line3: phone,
                  searchTerm: s.name,
                };
              }))
            .catch(() => [])
        );
      }

      // Inventory products (cross-shop promotions feed), filtered client-side.
      tasks.push(
        api.getPromotions()
          .then(list => (list || [])
            .filter(p => p.type === 'PRODUCT' &&
              ((p.title || '').toLowerCase().includes(q) || (p.productType || '').toLowerCase().includes(q)))
            .map(p => ({
              type: 'product',
              key: `product-${p.id}`,
              title: p.title,
              line2: p.productType || '',
              line3: p.shop?.name || '',
              searchTerm: p.title,
            })))
          .catch(() => [])
      );

      Promise.all(tasks).then(settled => {
        if (cancelled) return;
        setGlobalSearchResults(settled.flat());
        setGlobalSearchLoading(false);
      });
    }, 350);

    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSearchQuery, activeTab, user?.role]);

  // Fired only when the user taps a specific row in the results overview -
  // this is the sole point where global search causes navigation.
  const handleGlobalSearchResultClick = (result) => {
    const isSuper = user?.role === 'SUPER_ADMIN';
    let targetTab;
    let dispatchType;
    if (result.type === 'customer') {
      targetTab = isSuper ? 'super-customers' : 'history';
      dispatchType = 'customer';
    } else if (result.type === 'key') {
      targetTab = isSuper ? 'keys' : 'search-keys';
      dispatchType = 'key';
    } else if (result.type === 'shop') {
      targetTab = 'shops';
      dispatchType = 'shop';
    } else {
      targetTab = 'promotions';
      dispatchType = 'all';
    }
    setSearchDispatch({ query: result.searchTerm || result.title, type: dispatchType, nonce: Date.now() });
    setActiveTab(targetTab);
    setGlobalSearchQuery('');
    setGlobalSearchResults([]);
    setSearchTypeMenuOpen(false);
  };

  const PAGE_TITLES = {
    dashboard: t('dashboard'),
    shops: t('shops'),
    'super-customers': t('customers'),
    keys: t('keys'),
    'pricing-offers': t('pricing'),
    revenue: t('revenue'),
    'support-config': 'Support Config',
    promotions: 'Inventory',
    'search-keys': t('searchKeys'),
    register: t('register'),
    history: t('history'),
    reports: t('reports'),
    'customer-care': 'Customer Care',
    settings: t('settings'),
  };

  // The header no longer shows the page title as text (replaced by the global
  // search panel below), but the browser tab title still reflects it.
  useEffect(() => {
    document.title = PAGE_TITLES[activeTab] ? `${PAGE_TITLES[activeTab]} | Key Shop` : 'Key Shop';
  }, [activeTab, lang]);

  // Public (unauthenticated) marketing site page: home | search | about | contact | login.
  // Anonymous visitors land on 'home'; clicking "Login" (nav or hero CTA) switches this
  // to 'login', which renders the existing, unmodified login-shell UI below.
  // The native mobile app (IS_NATIVE_APP) has no use for the marketing site -
  // it starts straight on 'login' and the render below never shows PublicSite.
  const [publicPage, setPublicPage] = useState(IS_NATIVE_APP ? 'login' : 'home');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [autoOpenShopModal, setAutoOpenShopModal] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showLangDialog, setShowLangDialog] = useState(false);
  const langDialogCardRef = useRef(null);
  // Side-drawer and language dialog are both full-screen overlays - Back
  // should close them, not navigate the screen underneath.
  useBackHandler(mobileNavOpen, () => setMobileNavOpen(false));
  useBackHandler(showLangDialog, () => setShowLangDialog(false));

  // Auto-close the language dialog the instant the user interacts with
  // anything outside it - another sidebar link, a header/mobile-nav button,
  // etc. A document-level listener (rather than relying solely on the
  // dialog's own backdrop) is used because the mobile bottom-nav bar sits
  // at a higher z-index (60) than the dialog backdrop (50), so clicks on it
  // land directly on the nav button instead of the backdrop - but the click
  // still bubbles up to `document`, so this reliably catches it regardless
  // of stacking order, letting the underlying button's own onClick (e.g.
  // switching tabs) fire normally in the same click.
  useEffect(() => {
    if (!showLangDialog) return;
    const handleOutsideClick = (e) => {
      if (langDialogCardRef.current && !langDialogCardRef.current.contains(e.target)) {
        setShowLangDialog(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showLangDialog]);

  // Forgot password flow states
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetMethod, setResetMethod] = useState(null); // 'email' | 'phone' | null
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetOtpInput, setResetOtpInput] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetOtpDevCode, setResetOtpDevCode] = useState('');

  // Shop Self-Registration states - two-step wizard: Step 1 collects the
  // shop/owner details shown in the public registration screenshot (name,
  // shop name, address+GPS, city, state, PIN code, optional Aadhaar number,
  // OTP-verified mobile number); Step 2 collects password, subscription
  // plan and payment before submitting.
  const [showRegisterShop, setShowRegisterShop] = useState(false);
  const [regShopName, setRegShopName] = useState('');
  const [regOwnerName, setRegOwnerName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regLocation, setRegLocation] = useState('');
  // Raw GPS coordinates from captureShopLocation, kept alongside the
  // free-text `regLocation` address so they can be sent to the backend and
  // shown to the shop owner - previously captured only to build the address
  // string, then silently discarded (never stored or displayed).
  const [regLat, setRegLat] = useState(null);
  const [regLng, setRegLng] = useState(null);
  const [regLocLoading, setRegLocLoading] = useState(false);
  const [regLocError, setRegLocError] = useState('');
  const [regLocErrorKind, setRegLocErrorKind] = useState('');
  // City & State are auto-filled from reverse-geocoding the GPS position
  // captured via "Current Location" (Nominatim's district/state - see
  // captureShopLocation and geo.controller.ts) but stay editable in case
  // the auto-detected value needs correcting.
  const [regCity, setRegCity] = useState('');
  const [regState, setRegState] = useState('');
  const [regPinCode, setRegPinCode] = useState('');
  const [regAadhaarNumber, setRegAadhaarNumber] = useState('');
  // Shop "type" dropdown, populated from the Super-Admin-curated list (see
  // ShopCategoriesView) via the public GET /api/shop-categories endpoint -
  // fetched once the registration dialog opens (see useEffect below).
  const [regCategoryId, setRegCategoryId] = useState('');
  const [regCategories, setRegCategories] = useState([]);
  const [regCategoriesLoading, setRegCategoriesLoading] = useState(false);
  const [regPassword, setRegPassword] = useState('');
  const [regPlan, setRegPlan] = useState('MONTHLY'); // 'MONTHLY' | 'HALF_YEARLY' | 'YEARLY'
  const [regError, setRegError] = useState('');
  const [regSuccessMessage, setRegSuccessMessage] = useState('');
  // Login email returned by the backend (echoes dto.email - see
  // AuthService.registerShop) - shown once on the success screen so the
  // owner knows they can log in with either this email or their mobile
  // number, both sharing the one password set in Step 1.
  const [regLoginEmail, setRegLoginEmail] = useState('');
  const [regStep, setRegStep] = useState(1); // 1: Owner/shop details, email, mobile OTP & password, 2: Plan & payment
  // Pre-login shop signup wizard: Back steps back one stage while mid-flow,
  // same as the authenticated CustomerRegistrationWizard above. At step 1
  // there's nothing to intercept, so Back correctly falls through to the
  // normal double-press-to-exit behavior (there's no screen "under" the
  // signup form before you're logged in).
  useBackHandler(regStep > 1, () => setRegStep((s) => Math.max(1, s - 1)));

  // Mobile OTP verification - inline within Step 1 (the screenshot shows the
  // verify affordance directly under the Mobile Number field, not as a
  // separate wizard step). Phone-only - there's no email to verify against.
  const [regOtpSent, setRegOtpSent] = useState(false);
  const [regOtpVerified, setRegOtpVerified] = useState(false);
  const [regOtpInput, setRegOtpInput] = useState('');
  const [regOtpError, setRegOtpError] = useState('');
  const [regOtpLoading, setRegOtpLoading] = useState(false);
  // Testing convenience: backend only returns this when no real SMS
  // provider is configured, shown on-screen as a substitute for actual SMS
  // delivery. Disappears automatically once a real provider is configured.
  const [regOtpDevCode, setRegOtpDevCode] = useState('');

  // Self-Registration Payment states - plan selection and payment now live
  // on the same Step 2 screen (see the combined form below).
  const [regPayMethod, setRegPayMethod] = useState('card');
  const [regCardNumber, setRegCardNumber] = useState('');
  const [regCardExpiry, setRegCardExpiry] = useState('');
  const [regCardCvv, setRegCardCvv] = useState('');
  const [regCardHolder, setRegCardHolder] = useState('');
  const [regPayProcessing, setRegPayProcessing] = useState(false);
  const [regPaySuccess, setRegPaySuccess] = useState(false);

  // Password visibility states
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showVerifyPass, setShowVerifyPass] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      fetchNotifications();
    }
  }, [isAuthenticated, user]);

  // Populate the registration wizard's Category dropdown as soon as the
  // dialog opens - this must work pre-login, since self-registration has no
  // auth token yet (see api.getShopCategories).
  useEffect(() => {
    if (!showRegisterShop) return;
    setRegCategoriesLoading(true);
    api.getShopCategories()
      .then((cats) => setRegCategories(cats || []))
      .catch((e) => console.error('Failed to load shop categories:', e))
      .finally(() => setRegCategoriesLoading(false));
  }, [showRegisterShop]);



  const fetchNotifications = async () => {
    try {
      let res;
      if (user?.role === 'SUPER_ADMIN') {
        res = await api.getSuperNotifications();
      } else {
        res = await api.getNotifications();
      }
      const sorted = [...res].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setNotifications(sorted);
      setUnreadCount(sorted.filter(n => !n.isRead).length);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      await login(authEmail, authPassword);
      resetToDashboard();
    } catch (err) {
      setAuthError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetLoading(true);
    setResetOtpDevCode('');
    try {
      const result = await api.sendOtp(resetIdentifier, resetMethod || 'email', 'reset');
      if (result?.devCode) setResetOtpDevCode(result.devCode);
      setOtpSent(true);
    } catch (err) {
      setResetError(err.message || 'Failed to dispatch verification code');
    } finally {
      setResetLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetLoading(true);
    try {
      await api.verifyOtp(resetIdentifier, resetMethod || 'email', 'reset', resetOtpInput);
      setOtpVerified(true);
    } catch (err) {
      setResetError(err.message || 'Incorrect verification code. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    setResetError('');
    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match');
      return;
    }
    setResetLoading(true);
    try {
      await api.resetPasswordPublic(resetIdentifier, resetMethod, newPassword);
      setResetSuccess(true);
    } catch (err) {
      setResetError(err.message || 'Password reset failed');
    } finally {
      setResetLoading(false);
    }
  };

  const resetForgotPasswordFlow = () => {
    setShowForgotPassword(false);
    setResetMethod(null);
    setResetIdentifier('');
    setResetOtpInput('');
    setOtpSent(false);
    setOtpVerified(false);
    setNewPassword('');
    setConfirmPassword('');
    setResetError('');
    setResetSuccess(false);
    setResetOtpDevCode('');
  };

  // Inline mobile OTP verification for Step 1 - phone-only, no email option.
  const handleSendRegOtp = async () => {
    if (!regPhone) {
      alert('Please enter your mobile number first.');
      return;
    }
    if (!PHONE_REGEX.test(regPhone)) {
      alert(`Mobile number: ${PHONE_REGEX_MESSAGE}`);
      return;
    }
    setRegOtpLoading(true);
    setRegOtpError('');
    setRegOtpDevCode('');
    try {
      const result = await api.sendOtp(regPhone, 'phone', 'register');
      if (result?.devCode) setRegOtpDevCode(result.devCode);
      setRegOtpSent(true);
    } catch (err) {
      setRegOtpError(err.message || 'Failed to dispatch verification OTP.');
    } finally {
      setRegOtpLoading(false);
    }
  };

  const handleVerifyRegOtp = async (e) => {
    e.preventDefault();
    setRegOtpError('');
    setRegOtpLoading(true);
    try {
      await api.verifyOtp(regPhone, 'phone', 'register', regOtpInput);
      setRegOtpVerified(true);
    } catch (err) {
      setRegOtpError(err.message || 'Incorrect verification OTP code. Please try again.');
    } finally {
      setRegOtpLoading(false);
    }
  };

  // "Current Location" button for the Shop Registration wizard - captures the
  // device's real GPS position and reverse-geocodes it into the free-text
  // location field, plus auto-fills the dedicated City & State fields from
  // Nominatim's district/state (see geo.controller.ts - `district`, not
  // `city`, is used because state_district is the correct Indian
  // administrative "district", matching what the City field expects here).
  // All three fields stay normal editable inputs afterwards, so the shop
  // owner can correct/refine whatever gets auto-filled.
  const captureShopLocation = async () => {
    setRegLocError('');
    setRegLocErrorKind('');
    setRegLocLoading(true);
    let lat, lng;
    try {
      ({ lat, lng } = await resolveCurrentLocation());
    } catch (e) {
      setRegLocError(e.message);
      setRegLocErrorKind(e.kind || 'unavailable');
      setRegLocLoading(false);
      return;
    }
    setRegLat(lat);
    setRegLng(lng);
    const data = await reverseGeocode(lat, lng);
    if (data) {
      const parts = [data.street, data.locality].filter(Boolean);
      setRegLocation(parts.length > 0 ? parts.join(', ') : `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      if (data.district) setRegCity(data.district);
      if (data.state) setRegState(data.state);
      setRegLocLoading(false);
      return;
    }
    setRegLocation(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    setRegLocLoading(false);
  };

  const handleRegCheckout = async (e) => {
    e.preventDefault();
    setRegPayProcessing(true);

    const logs = [
      'Establishing secure payment tunnel...',
      'Verifying account assets & fraud parameters...',
      'Settling subscription merchant account...',
      'Confirming tokenized gateway response...'
    ];

    for (let i = 0; i < logs.length; i++) {
      await new Promise(r => setTimeout(r, 600));
    }

    try {
      const res = await api.registerShop({
        shopName: regShopName,
        ownerName: regOwnerName,
        categoryId: regCategoryId,
        email: regEmail,
        phone: regPhone,
        location: regLocation,
        city: regCity,
        state: regState,
        pinCode: regPinCode,
        aadhaarNumber: regAadhaarNumber || undefined,
        password: regPassword,
        plan: regPlan,
        latitude: regLat ?? undefined,
        longitude: regLng ?? undefined,
      });

      setRegPayProcessing(false);
      setRegPaySuccess(true);
      setRegLoginEmail(res.loginEmail || '');
      setRegSuccessMessage(res.message || 'Registration successful! Your shop account is now active - you can log in right away.');
    } catch (err) {
      setRegPayProcessing(false);
      setRegError(err.message || 'Self-registration failed.');
    }
  };

  const resetRegisterShopFlow = () => {
    setShowRegisterShop(false);
    setRegShopName('');
    setRegOwnerName('');
    setRegEmail('');
    setRegPhone('');
    setRegLocation('');
    setRegLat(null);
    setRegLng(null);
    setRegLocLoading(false);
    setRegLocError('');
    setRegLocErrorKind('');
    setRegCity('');
    setRegState('');
    setRegPinCode('');
    setRegAadhaarNumber('');
    setRegCategoryId('');
    setRegPassword('');
    setRegPlan('MONTHLY');
    setRegError('');
    setRegSuccessMessage('');
    setRegLoginEmail('');
    setRegOtpSent(false);
    setRegOtpVerified(false);
    setRegOtpInput('');
    setRegOtpError('');
    setRegOtpLoading(false);
    setRegOtpDevCode('');
    setRegPayMethod('card');
    setRegCardNumber('');
    setRegCardExpiry('');
    setRegCardCvv('');
    setRegCardHolder('');
    setRegPayProcessing(false);
    setRegPaySuccess(false);
    setRegStep(1);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--bg-0)' }}>
        <div className="flex flex-col items-center gap-5 animate-fade-in">
          <div className="brand">
            <img src={keyShopLogo} alt="Key Shop" className="brand-logo" />
          </div>
          <RefreshCw className="h-6 w-6 animate-spin" style={{ color: 'var(--gold)' }} />
          <p style={{ color: 'var(--text-3)' }} className="text-sm font-semibold">Bootstrapping your workspace&hellip;</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {!isAuthenticated ? (
        !IS_NATIVE_APP && publicPage !== 'login' ? (
          <PublicSite page={publicPage} onNavigate={setPublicPage} api={api} />
        ) : (
        <div className="login-shell">
          <div className="login-side">
            <div className="glow"></div>
            <div className="side-copy">
              <span className="pill-badge" style={{ marginBottom: 18 }}>
                <span className="dot"></span>
                Trusted by 500+ key shops across India
              </span>
              <h2>Run your shop<span className="gold-line">the smart, gold-standard way.</span></h2>
              <p>Track duplicate keys, customers and store orders across every branch &mdash; one bold dashboard built for Indian locksmiths.</p>
            </div>

            <div className="phone-frame">
              <div className="phone-notch"></div>
              <div className="phone-screen">
                <div className="p-head">
                  <span className="p-title">Key Shop Dashboard</span>
                  <span className="phone-badge"></span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="phone-stat">
                    <div className="num">1,284</div>
                    <div className="lbl">Customers</div>
                  </div>
                  <div className="phone-stat">
                    <div className="num">3,910</div>
                    <div className="lbl">Keys Cut</div>
                  </div>
                </div>
                <div className="phone-mini-bars">
                  <div className="mb" style={{ height: '35%' }}></div>
                  <div className="mb" style={{ height: '55%' }}></div>
                  <div className="mb" style={{ height: '40%' }}></div>
                  <div className="mb" style={{ height: '72%' }}></div>
                  <div className="mb" style={{ height: '58%' }}></div>
                  <div className="mb" style={{ height: '90%' }}></div>
                  <div className="mb" style={{ height: '64%' }}></div>
                </div>
                <div className="phone-row">
                  <div className="dotpic"></div>
                  <div className="lines"><div className="l1"></div><div className="l2"></div></div>
                </div>
                <div className="phone-row">
                  <div className="dotpic"></div>
                  <div className="lines"><div className="l1"></div><div className="l2"></div></div>
                </div>
              </div>
            </div>
          </div>

          <div className="login-form-side">
            <div className="login-box animate-fade-in">
              {!IS_NATIVE_APP && (
                <button type="button" className="back-to-home-link" onClick={() => setPublicPage('home')}>
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to home
                </button>
              )}
              <div className="brand">
                <img src={keyShopLogo} alt="Key Shop" className="brand-logo" />
              </div>
              <h1>Welcome back</h1>
              <p className="lead">Sign in to run your duplicate-key shop &mdash; orders, customers and inventory, all in one place.</p>

              {authError && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.35)', color: '#b91c1c', padding: '12px 14px', borderRadius: 13, marginBottom: 20, fontSize: 12.5, fontWeight: 600 }}>
                  <AlertTriangle className="h-4 w-4 shrink-0" style={{ marginTop: 1 }} />
                  <span>{authError}</span>
                </div>
              )}

              <form onSubmit={handleLoginSubmit}>
                <div className="reg-section">
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Mail /></div><b>Email or Mobile Number <span className="req">*</span></b></div>
                    <div className="input-wrap">
                      <input
                        type="text" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)}
                        placeholder="Email address or mobile number"
                      />
                    </div>
                  </div>
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Lock /></div><b>Password <span className="req">*</span></b></div>
                    <div className="input-wrap">
                      <input
                        type={showAuthPassword ? "text" : "password"} required value={authPassword} onChange={(e) => setAuthPassword(e.target.value)}
                        placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" style={{ paddingRight: 42 }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowAuthPassword(!showAuthPassword)}
                        className="pwd-toggle-btn"
                        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}
                      >
                        {showAuthPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="field-row">
                  <label className="remember">
                    <input type="checkbox" defaultChecked />
                    Remember me
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="forgot-link"
                  >
                    Forgot password?
                  </button>
                </div>
                <button
                  type="submit" disabled={authLoading}
                  className="btn btn-primary btn-block"
                >
                  {authLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <>Sign in to Key Shop <ArrowRight /></>}
                </button>
              </form>

              {/* Shop Admin accounts can't sign in on web (see auth.service.ts) -
                  give them a direct way to get the app right where they'll hit
                  that error, instead of leaving them stuck on this screen. */}
              {!IS_NATIVE_APP && (
                <a
                  href="/downloads/keyshop-app.keeapp"
                  download="KeyShop.apk"
                  className="btn btn-outline btn-block"
                  style={{ marginTop: 12 }}
                >
                  <Download className="h-4 w-4" /> Shop Admin? Download the app
                </a>
              )}

              <div className="login-foot" style={{ marginTop: 20 }}>
                Want to register your shop?{' '}
                <button
                  type="button"
                  onClick={() => setShowRegisterShop(true)}
                >
                  Create shop account
                </button>
              </div>
            </div>
          </div>

          {/* Forgot Password Overlay Modal */}
          {showForgotPassword && (
            <div className="fixed inset-0 z-[60] flex justify-center p-4" style={{ background: 'rgba(5,4,3,0.82)' }}>
              <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 420, padding: 32, margin: 'auto', position: 'relative' }}>
                <button
                  onClick={resetForgotPasswordFlow}
                  className="icon-btn"
                  style={{ position: 'absolute', top: 18, right: 18 }}
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="flex flex-col items-center mb-6" style={{ textAlign: 'center' }}>
                  <div className="icon-badge solid" style={{ marginBottom: 10 }}>
                    <Lock />
                  </div>
                  <h2 style={{ fontSize: 20 }}>Reset your password</h2>
                  <p style={{ color: 'var(--text-3)', fontSize: 12, fontWeight: 600, marginTop: 4 }}>Secure recovery for your workspace</p>
                </div>

                {resetError && (
                  <div style={{ display: 'flex', gap: 8, background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.35)', padding: 10, borderRadius: 12, fontSize: 12, color: '#b91c1c', marginBottom: 16, fontWeight: 600 }}>
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{resetError}</span>
                  </div>
                )}

                {resetSuccess ? (
                  <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <div className="icon-badge green" style={{ margin: '0 auto 14px' }}>
                      <Check />
                    </div>
                    <p style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13, fontFamily: 'var(--display)' }}>Password reset successfully</p>
                    <p style={{ color: 'var(--text-3)', fontSize: 12, fontWeight: 600, marginTop: 4, marginBottom: 20 }}>You can now sign in with your new credentials.</p>
                    <button
                      onClick={resetForgotPasswordFlow}
                      className="btn btn-primary btn-block"
                    >
                      Return to login
                    </button>
                  </div>
                ) : resetMethod === null ? (
                  <div>
                    <p style={{ color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, textAlign: 'center', lineHeight: 1.6, marginBottom: 18 }}>
                      Select your verification method to recover your workspace credentials.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setResetMethod('email')}
                        className="qa-btn"
                        style={{ flexDirection: 'column', textAlign: 'center', gap: 10, minWidth: 0 }}
                      >
                        <span className="icon-badge blue"><Mail /></span>
                        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.03em' }}>Email OTP</span>
                      </button>
                      <button
                        onClick={() => setResetMethod('phone')}
                        className="qa-btn"
                        style={{ flexDirection: 'column', textAlign: 'center', gap: 10, minWidth: 0 }}
                      >
                        <span className="icon-badge teal"><Phone /></span>
                        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.03em' }}>Phone OTP</span>
                      </button>
                    </div>
                    <button
                      onClick={resetForgotPasswordFlow}
                      className="btn btn-ghost btn-block"
                      style={{ marginTop: 14 }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : !otpSent ? (
                  <form onSubmit={handleSendOtp}>
                    <p style={{ color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, textAlign: 'center', marginBottom: 16 }}>
                      Enter the registered {resetMethod} associated with your workspace to request a reset code.
                    </p>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: resetMethod === 'email' ? 'var(--blue)' : 'var(--teal)' }}>{resetMethod === 'email' ? <Mail /> : <Phone />}</div><b>{resetMethod === 'email' ? 'Registered Email' : 'Registered Phone Number'} <span className="req">*</span></b></div>
                      <div className="input-wrap">
                        <input
                          type={resetMethod === 'email' ? 'email' : 'text'}
                          required
                          value={resetIdentifier}
                          onChange={(e) => setResetIdentifier(e.target.value)}
                          placeholder={resetMethod === 'email' ? 'e.g. shop@keyshop.com' : 'e.g. +91 99999 99999'}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setResetMethod(null); setResetIdentifier(''); }}
                        className="btn btn-ghost"
                        style={{ flex: 1 }}
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={resetLoading}
                        className="btn btn-primary"
                        style={{ flex: 2 }}
                      >
                        {resetLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Send OTP code'}
                      </button>
                    </div>
                  </form>
                ) : !otpVerified ? (
                  <form onSubmit={handleVerifyOtp}>
                    <p style={{ color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, textAlign: 'center', lineHeight: 1.6, marginBottom: 14 }}>
                      A 4-digit code has been dispatched to <span style={{ color: 'var(--gold)', fontWeight: 800 }}>{resetIdentifier}</span>.
                    </p>
                    {resetOtpDevCode && (
                      <div style={{ background: 'var(--card-2)', border: '1.5px dashed var(--gold)', borderRadius: 12, padding: '10px 14px', textAlign: 'center', marginBottom: 14 }}>
                        <p style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>
                          Testing mode &mdash; no {resetMethod === 'phone' ? 'SMS' : 'SMTP'} provider configured
                        </p>
                        <p style={{ fontSize: 20, color: 'var(--gold)', fontWeight: 800, letterSpacing: '.2em' }}>{resetOtpDevCode}</p>
                      </div>
                    )}
                    {resetError && <div style={{ color: 'var(--red)', fontSize: 12, fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>{resetError}</div>}
                    <div className="field">
                      <label style={{ textAlign: 'center' }}>Enter OTP</label>
                      <input
                        type="text"
                        required
                        maxLength={4}
                        value={resetOtpInput}
                        onChange={(e) => setResetOtpInput(e.target.value.replace(/\D/g, ''))}
                        placeholder="1234"
                        style={{ width: '100%', background: 'var(--card-2)', border: '1.5px solid var(--border-2)', color: 'var(--text-0)', borderRadius: 13, padding: '13px 15px', fontSize: 16, textAlign: 'center', letterSpacing: '.3em', fontWeight: 800, outline: 'none' }}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setOtpSent(false)}
                        className="btn btn-ghost"
                        style={{ flex: 1 }}
                      >
                        Resend
                      </button>
                      <button type="submit" disabled={resetLoading} className="btn btn-primary" style={{ flex: 2 }}>
                        {resetLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Verify OTP'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleResetPasswordSubmit}>
                    <p style={{ color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, textAlign: 'center', marginBottom: 16 }}>
                      OTP verified. Please set a new password below.
                    </p>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Lock /></div><b>New Password <span className="req">*</span></b></div>
                      <div className="input-wrap">
                        <input
                          type="password"
                          required
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Min 6 characters"
                        />
                      </div>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><Lock /></div><b>Confirm Password <span className="req">*</span></b></div>
                      <div className="input-wrap">
                        <input
                          type="password"
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Retype password"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={resetLoading}
                      className="btn btn-primary btn-block"
                    >
                      {resetLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Update password'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {showRegisterShop && (

    <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.82)' }}>
      <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 460, margin: 'auto', padding: 28 }}>
        <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
          <div>
            <span className="eyebrow" style={{ marginBottom: 4 }}><Building2 />Shop onboarding</span>
            <h2 style={{ fontSize: 19 }}>Register your key shop</h2>
          </div>
          <button
            onClick={() => {
              resetRegisterShopFlow();
              setRegStep(1);
            }}
            className="icon-btn"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {regSuccessMessage ? (
          <div style={{ textAlign: 'center', padding: '18px 0' }}>
            <div className="icon-badge green" style={{ margin: '0 auto 16px' }}>
              <Check />
            </div>
            <h3 style={{ fontSize: 16 }}>Registration submitted</h3>
            <p style={{ color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, lineHeight: 1.6, padding: '0 8px', marginTop: 8, marginBottom: regLoginEmail ? 12 : 20 }}>
              {regSuccessMessage}
            </p>
            {regLoginEmail && (
              <div style={{ background: 'var(--card-2)', border: '1.5px dashed var(--gold)', borderRadius: 12, padding: '10px 14px', textAlign: 'center', marginBottom: 20 }}>
                <p style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>
                  You can log in with either
                </p>
                <p style={{ fontSize: 14, color: 'var(--gold)', fontWeight: 800 }}>{regLoginEmail}</p>
                {regPhone && <p style={{ fontSize: 14, color: 'var(--gold)', fontWeight: 800, marginTop: 2 }}>{regPhone}</p>}
              </div>
            )}
            <button
              onClick={() => {
                resetRegisterShopFlow();
                setRegStep(1);
              }}
              className="btn btn-ghost"
            >
              Return to login
            </button>
          </div>
        ) : (
          <div>
            {regError && (
              <div style={{ display: 'flex', gap: 8, background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.35)', padding: 10, borderRadius: 12, fontSize: 12, color: '#b91c1c', fontWeight: 600, marginBottom: 16 }}>
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{regError}</span>
              </div>
            )}

            {/* STEP 1: Basic Details - a single flat form (no section labels),
                matching the app's registration screenshot, including inline
                mobile OTP verification and password - not separate steps. */}
            {regStep === 1 && (
              <div>
                <div className="reg-section">
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><UserCheck /></div><b>Name <span className="req">*</span></b></div>
                    <div className="input-wrap">
                      <input
                        type="text" required value={regOwnerName} onChange={(e) => setRegOwnerName(e.target.value)}
                        placeholder="e.g. Rajesh Kumar"
                      />
                    </div>
                  </div>
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><Building2 /></div><b>Shop Name <span className="req">*</span></b></div>
                    <div className="input-wrap">
                      <input
                        type="text" required value={regShopName} onChange={(e) => setRegShopName(e.target.value)}
                        placeholder="e.g. Metro Duplicate Keys"
                      />
                    </div>
                  </div>
                  <div className="reg-field">
                    <div className="reg-field-label">
                      <div className="reg-ico" style={{ background: 'var(--orange)' }}><MapPin /></div>
                      <b>Shop Address <span className="req">*</span></b>
                      <button
                        type="button" onClick={captureShopLocation} disabled={regLocLoading}
                        className="reg-trailing loc-btn"
                      >
                        <Crosshair className={regLocLoading ? 'animate-spin' : ''} />
                        <span>{regLocLoading ? 'Locating…' : 'Current Location'}</span>
                      </button>
                    </div>
                    <div className="input-wrap">
                      <input
                        type="text" required value={regLocation} onChange={(e) => setRegLocation(e.target.value)}
                        placeholder="Street / landmark"
                      />
                    </div>
                    {/* GPS coordinates captured via the button above are reverse-geocoded
                        server-side and used to auto-fill City/State below (still editable),
                        as well as being shown here so the owner can confirm what will be
                        stored alongside the free-text address (see regLat/regLng state). */}
                    {regLat != null && regLng != null && (
                      <p style={{ marginTop: 6, fontSize: 11, color: 'var(--text-3)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MapPin style={{ width: 11, height: 11 }} /> {regLat.toFixed(5)}, {regLng.toFixed(5)}
                      </p>
                    )}
                    {regLocError && (
                      <div style={{ marginTop: 6 }}>
                        <p style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 700 }}>{regLocError}</p>
                        {regLocErrorKind === 'disabled' && (
                          <button
                            type="button"
                            onClick={openDeviceLocationSettings}
                            className="cursor-pointer select-none"
                            style={{ fontSize: 10.5, color: 'var(--gold)', fontWeight: 800, background: 'none', border: 'none', padding: 0, textDecoration: 'underline', marginTop: 2 }}
                          >
                            Open Location Settings
                          </button>
                        )}
                        {regLocErrorKind === 'permission' && IS_NATIVE_APP && (
                          <button
                            type="button"
                            onClick={openAppSettings}
                            className="cursor-pointer select-none"
                            style={{ fontSize: 10.5, color: 'var(--gold)', fontWeight: 800, background: 'none', border: 'none', padding: 0, textDecoration: 'underline', marginTop: 2 }}
                          >
                            Open App Settings
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="row2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="reg-field" style={{ marginBottom: 0 }}>
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><MapPin /></div><b>City <span className="req">*</span></b></div>
                      <div className="input-wrap">
                        <input
                          type="text" required value={regCity} onChange={(e) => setRegCity(e.target.value)}
                          placeholder="Auto-filled from GPS"
                        />
                      </div>
                    </div>
                    <div className="reg-field" style={{ marginBottom: 0 }}>
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><MapPin /></div><b>State <span className="req">*</span></b></div>
                      <div className="input-wrap">
                        <input
                          type="text" required value={regState} onChange={(e) => setRegState(e.target.value)}
                          placeholder="Auto-filled from GPS"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><MapPin /></div><b>PIN Code <span className="req">*</span></b></div>
                    <div className="input-wrap">
                      <input
                        type="text" required inputMode="numeric" maxLength={6} value={regPinCode} onChange={(e) => setRegPinCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="6-digit PIN code"
                      />
                    </div>
                  </div>
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><CreditCard /></div><b>Aadhaar Number</b></div>
                    <div className="input-wrap">
                      <input
                        type="text" inputMode="numeric" maxLength={12} value={regAadhaarNumber} onChange={(e) => setRegAadhaarNumber(e.target.value.replace(/\D/g, ''))}
                        placeholder="12-digit Aadhaar number (optional)"
                      />
                    </div>
                  </div>
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange, #f59e0b)' }}><Tag /></div><b>Category <span className="req">*</span></b></div>
                    <CustomSelect
                      value={regCategoryId} onChange={setRegCategoryId}
                      disabled={regCategoriesLoading}
                      placeholder={regCategoriesLoading ? 'Loading categories…' : 'Select shop category'}
                      emptyLabel="No shop categories available yet"
                      options={regCategories.map((cat) => ({ value: cat.id, label: cat.name }))}
                    />
                  </div>
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--red)' }}><Mail /></div><b>Email Address <span className="req">*</span></b></div>
                    <div className="input-wrap">
                      <input
                        type="email" required value={regEmail} onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Phone /></div><b>Mobile Number <span className="req">*</span></b></div>
                    <div className="input-wrap">
                      <input
                        type="tel" required value={regPhone} disabled={regOtpVerified}
                        onChange={(e) => { setRegPhone(e.target.value); setRegOtpSent(false); setRegOtpVerified(false); setRegOtpDevCode(''); }}
                        placeholder="10-digit mobile" style={{ opacity: regOtpVerified ? 0.6 : 1 }}
                      />
                    </div>
                  </div>

                  {regOtpVerified ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green)', fontSize: 12, fontWeight: 800 }}>
                      <CheckCircle2 className="h-4 w-4" /> Mobile number verified
                    </div>
                  ) : !regOtpSent ? (
                    <button
                      type="button" onClick={handleSendRegOtp} disabled={regOtpLoading}
                      className="btn btn-primary" style={{ width: '100%' }}
                    >
                      {regOtpLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                      Send OTP to verify
                    </button>
                  ) : (
                    <div>
                      {regOtpError && <div style={{ color: 'var(--red)', fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{regOtpError}</div>}

                      {regOtpDevCode && (
                        <div style={{ background: 'var(--card-2)', border: '1.5px dashed var(--gold)', borderRadius: 12, padding: '10px 14px', textAlign: 'center', marginBottom: 12 }}>
                          <p style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>
                            Testing mode &mdash; no SMS provider configured
                          </p>
                          <p style={{ fontSize: 20, color: 'var(--gold)', fontWeight: 800, letterSpacing: '.2em' }}>{regOtpDevCode}</p>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <input
                          type="text" maxLength={4} value={regOtpInput} onChange={(e) => setRegOtpInput(e.target.value.replace(/\D/g, ''))}
                          placeholder="OTP"
                          style={{ flex: 1, background: 'var(--card-2)', border: '1.5px solid var(--border-2)', color: 'var(--text-0)', borderRadius: 13, padding: '11px 15px', fontSize: 16, textAlign: 'center', letterSpacing: '.3em', fontWeight: 800, outline: 'none' }}
                        />
                        <button type="button" onClick={handleVerifyRegOtp} disabled={regOtpLoading} className="btn btn-primary">
                          {regOtpLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Verify'}
                        </button>
                      </div>
                      <button
                        type="button" onClick={() => { setRegOtpSent(false); setRegOtpDevCode(''); setRegOtpInput(''); }}
                        style={{ display: 'block', margin: '10px auto 0', fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textDecoration: 'underline' }}
                      >
                        Resend OTP
                      </button>
                    </div>
                  )}

                  <div className="reg-field" style={{ marginTop: 13 }}>
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Lock /></div><b>Password <span className="req">*</span></b></div>
                    <div className="input-wrap">
                      <input
                        type={showRegPassword ? "text" : "password"} required minLength={6} value={regPassword} onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Min 6 characters" style={{ paddingRight: 42 }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword(!showRegPassword)}
                        className="pwd-toggle-btn"
                        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}
                      >
                        {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end" style={{ marginTop: 20 }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!regShopName || !regOwnerName || !regCategoryId || !regEmail || !regPhone || !regLocation || !regCity || !regState || !regPinCode) {
                        alert('Please fill out all required registration fields.');
                        return;
                      }
                      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail)) {
                        alert('Please enter a valid email address.');
                        return;
                      }
                      if (!PHONE_REGEX.test(regPhone)) {
                        alert(`Mobile number: ${PHONE_REGEX_MESSAGE}`);
                        return;
                      }
                      if (!/^\d{6}$/.test(regPinCode)) {
                        alert('PIN code must be exactly 6 digits.');
                        return;
                      }
                      if (regAadhaarNumber && !/^\d{12}$/.test(regAadhaarNumber)) {
                        alert('Aadhaar number must be exactly 12 digits.');
                        return;
                      }
                      if (!regOtpVerified) {
                        alert('Please verify your mobile number with the OTP before continuing.');
                        return;
                      }
                      if (!regPassword || regPassword.length < 6) {
                        alert('Password must be at least 6 characters.');
                        return;
                      }
                      setRegStep(2);
                    }}
                    className="btn btn-primary reg-submit-btn"
                  >
                    Continue <ArrowRight />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Plan & Payment - combined onto a single screen so the
                shop owner picks a subscription plan and settles payment
                without an extra "Continue to payment" click/screen. */}
            {regStep === 2 && (
              <form onSubmit={handleRegCheckout} className="animate-fade-in relative overflow-hidden">
                {regPayProcessing && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" style={{ background: 'rgba(10,9,8,0.92)', zIndex: 20 }}>
                    <div className="relative w-12 h-12 flex items-center justify-center">
                      <span className="absolute inset-0 rounded-full" style={{ border: '4px solid var(--gold-dim)' }}></span>
                      <span className="absolute inset-0 rounded-full animate-spin" style={{ border: '4px solid transparent', borderTopColor: 'var(--gold)' }}></span>
                    </div>
                    <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em' }}>Settling payment&hellip;</h3>
                  </div>
                )}

                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: 'var(--text-1)', marginBottom: 8, fontFamily: 'var(--display)' }}>Choose subscription plan</label>
                  <div className="store-tabs" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setRegPlan('MONTHLY')}
                      className={`store-tab ${regPlan === 'MONTHLY' ? 'active' : ''}`}
                      style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 8px' }}
                    >
                      <span>Monthly</span>
                      <span style={{ fontSize: 9, opacity: 0.75 }}>Rs. 49</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegPlan('HALF_YEARLY')}
                      className={`store-tab ${regPlan === 'HALF_YEARLY' ? 'active' : ''}`}
                      style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 8px' }}
                    >
                      <span>6 Months</span>
                      <span style={{ fontSize: 9, opacity: 0.75 }}>Rs. 269</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegPlan('YEARLY')}
                      className={`store-tab ${regPlan === 'YEARLY' ? 'active' : ''}`}
                      style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 8px' }}
                    >
                      <span>Yearly</span>
                      <span style={{ fontSize: 9, opacity: 0.75 }}>Rs. 499</span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center" style={{ background: 'var(--card-2)', padding: 14, borderRadius: 14, border: '1px solid var(--border-2)', marginBottom: 18, fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                  <span>Payable amount</span>
                  <span style={{ fontWeight: 800, color: 'var(--gold)', fontSize: 16, fontFamily: 'var(--display)' }}>
                    Rs. {regPlan === 'MONTHLY' ? '49.00' : regPlan === 'HALF_YEARLY' ? '269.00' : '499.00'}
                  </span>
                </div>

                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: 'var(--text-1)', marginBottom: 8, fontFamily: 'var(--display)' }}>Choose payment channel</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button" onClick={() => setRegPayMethod('card')}
                      className={`store-tab ${regPayMethod === 'card' ? 'active' : ''}`}
                      style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 8px' }}
                    >
                      <CreditCard className="h-4 w-4" />
                      <span style={{ fontSize: 10 }}>Credit card</span>
                    </button>
                    <button
                      type="button" onClick={() => setRegPayMethod('upi')}
                      className={`store-tab ${regPayMethod === 'upi' ? 'active' : ''}`}
                      style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 8px' }}
                    >
                      <QrCode className="h-4 w-4" />
                      <span style={{ fontSize: 10 }}>UPI / QR scan</span>
                    </button>
                  </div>
                </div>

                {regPayMethod === 'card' ? (
                  <div className="animate-fade-in reg-section">
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><CreditCard /></div><b>Card Number <span className="req">*</span></b></div>
                      <div className="input-wrap">
                        <input
                          type="text" required maxLength={16} placeholder="4111 2222 3333 4444" value={regCardNumber} onChange={(e) => setRegCardNumber(e.target.value.replace(/\D/g, ''))}
                          style={{ fontFamily: 'monospace' }}
                        />
                      </div>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><UserCheck /></div><b>Cardholder Name <span className="req">*</span></b></div>
                      <div className="input-wrap">
                        <input
                          type="text" required placeholder="RAJESH KUMAR" value={regCardHolder} onChange={(e) => setRegCardHolder(e.target.value.toUpperCase())}
                        />
                      </div>
                    </div>
                    <div className="row2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div className="reg-field" style={{ marginBottom: 0 }}>
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Calendar /></div><b>Expiry <span className="req">*</span></b></div>
                        <div className="input-wrap">
                          <input
                            type="text" required maxLength={5} placeholder="MM/YY" value={regCardExpiry} onChange={(e) => setRegCardExpiry(e.target.value)}
                            style={{ textAlign: 'center' }}
                          />
                        </div>
                      </div>
                      <div className="reg-field" style={{ marginBottom: 0 }}>
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><Lock /></div><b>CVV <span className="req">*</span></b></div>
                        <div className="input-wrap">
                          <input
                            type="password" required maxLength={3} placeholder="***" value={regCardCvv} onChange={(e) => setRegCardCvv(e.target.value.replace(/\D/g, ''))}
                            style={{ textAlign: 'center', fontFamily: 'monospace' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="animate-fade-in" style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 24, borderRadius: 16, textAlign: 'center' }}>
                    <QrCode className="h-12 w-12" style={{ color: 'var(--gold)', margin: '0 auto 12px' }} />
                    <p style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 600, marginBottom: 8 }}>Scan QR code using GooglePay, PhonePe, or Paytm</p>
                    <span style={{ fontWeight: 800, fontSize: 13, fontFamily: 'monospace', color: 'var(--text-0)' }}>UPI: keeplace.register@icici</span>
                  </div>
                )}

                <div className="flex gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
                  <button type="button" onClick={() => setRegStep(1)} className="btn btn-ghost" style={{ flex: 1 }}>
                    Back
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                    Pay & settle setup
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  )}
        </div>
        )
      ) : (
        <div className="min-h-[calc(100vh-40px)] flex flex-col md:flex-row">
          {/* Mobile nav backdrop - must sit above every other fixed/sticky
              mobile chrome (header, bottom nav, floating buttons), so it's
              pinned to an explicit z-index well above the highest value used
              anywhere else in the app (see .mobile-nav-drawer-backdrop /
              .mobile-nav-drawer in index.css). Tapping it closes the drawer. */}
          {mobileNavOpen && (
            <div
              className="mobile-nav-drawer-backdrop fixed inset-0 md:hidden"
              style={{ background: 'rgba(5,4,3,0.7)' }}
              onClick={() => setMobileNavOpen(false)}
            />
          )}

          {/* SIDEBAR NAVIGATION - on mobile this is a full-screen overlay
              drawer (see .mobile-nav-drawer in index.css for the z-index
              that guarantees it always renders above the header, page
              content, floating buttons and bottom nav bar). Closes when a
              menu item is tapped (delegated onClick below) or when the
              backdrop above is tapped. */}
          <aside
            className={`sidebar mobile-nav-drawer w-[82%] max-w-[320px] md:w-64 flex flex-col shrink-0 fixed md:static inset-y-0 left-0 md:z-auto transition-transform duration-300 ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
            style={{ overflowY: 'auto' }}
          >
            <div className="brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <img src={keyShopLogo} alt="Key Shop" className="brand-logo" />
              </span>
              <button className="icon-btn md:hidden" onClick={() => setMobileNavOpen(false)}>
                <X />
              </button>
            </div>

            <div style={{ padding: '0 20px 18px' }}>
              <span className="role-pill">
                <ShieldCheck />
                {user.role === 'SUPER_ADMIN' ? t('superAdmin') : t('shopTerminal')}
              </span>
            </div>

            {/* Language Selector Dropdown */}
            <div style={{ padding: '0 20px 16px', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
              <label className="side-section-label" style={{ padding: 0, marginBottom: 8, display: 'block' }}>Language &middot; भाषा &middot; மொழி</label>
              <CustomSelect
                value={lang}
                onChange={(v) => {
                  setLang(v);
                  localStorage.setItem('kee_lang', v);
                }}
                triggerStyle={{ padding: '9px 32px 9px 12px', fontSize: 12 }}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'hi', label: 'Hindi (हिन्दी)' },
                  { value: 'ta', label: 'Tamil (தமிழ்)' },
                  { value: 'te', label: 'Telugu (తెలుగు)' },
                  { value: 'kn', label: 'Kannada (ಕನ್ನಡ)' },
                  { value: 'ml', label: 'Malayalam (മലയാളം)' },
                ]}
              />
            </div>

            <nav style={{ flex: 1, padding: '0 12px', overflowY: 'auto' }} onClick={(e) => { if (e.target.closest('button')) setMobileNavOpen(false); }}>
              <div className="side-section-label">Overview</div>
              <button
                onClick={() => resetToDashboard()}
                className={`side-link ${activeTab === 'dashboard' ? 'active' : ''}`}
              >
                <span className="nav-ico" style={{ background: 'var(--maroon)' }}><Sliders /></span>
                <span>{t('dashboard')}</span>
              </button>

              {user.role === 'SUPER_ADMIN' ? (
                <>
                  <div className="side-section-label">Operations</div>
                  <button
                    onClick={() => setActiveTab('shops')}
                    className={`side-link ${activeTab === 'shops' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--blue)' }}><Layers /></span>
                    <span>{t('shops')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('super-customers')}
                    className={`side-link ${activeTab === 'super-customers' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--purple)' }}><Users /></span>
                    <span>{t('customers')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('keys')}
                    className={`side-link ${activeTab === 'keys' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--teal)' }}><Database /></span>
                    <span>{t('keys')}</span>
                  </button>

                  <div className="side-section-label">Business</div>
                  <button
                    onClick={() => setActiveTab('pricing-offers')}
                    className={`side-link ${activeTab === 'pricing-offers' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--orange)' }}><Settings /></span>
                    <span>{t('pricing')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('revenue')}
                    className={`side-link ${activeTab === 'revenue' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--jgreen)' }}><DollarSign /></span>
                    <span>{t('revenue')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('promotions')}
                    className={`side-link ${activeTab === 'promotions' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--pink)' }}><Megaphone /></span>
                    <span>Inventory</span>
                  </button>

                  <div className="side-section-label">Support</div>
                  <button
                    onClick={() => setActiveTab('support-config')}
                    className={`side-link ${activeTab === 'support-config' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--rose)' }}><Phone /></span>
                    <span>Support Config</span>
                  </button>
                </>
              ) : (
                <>
                  <div className="side-section-label">Operations</div>
                  <button
                    onClick={() => setActiveTab('search-keys')}
                    className={`side-link ${activeTab === 'search-keys' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--blue)' }}><Search /></span>
                    <span>{t('searchKeys')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('register')}
                    className={`side-link ${activeTab === 'register' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--jgreen)' }}><Plus /></span>
                    <span>{t('register')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    className={`side-link ${activeTab === 'history' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--purple)' }}><Users /></span>
                    <span>{t('history')}</span>
                  </button>

                  <div className="side-section-label">Store</div>
                  <button
                    onClick={() => setActiveTab('reports')}
                    className={`side-link ${activeTab === 'reports' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--orange)' }}><BarChart3 /></span>
                    <span>{t('reports')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('promotions')}
                    className={`side-link ${activeTab === 'promotions' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--pink)' }}><Megaphone /></span>
                    <span>Inventory</span>
                  </button>

                  <div className="side-section-label">Settings</div>
                  <button
                    onClick={() => setActiveTab('customer-care')}
                    className={`side-link ${activeTab === 'customer-care' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--rose)' }}><Phone /></span>
                    <span>Customer Care</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('settings')}
                    className={`side-link ${activeTab === 'settings' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--maroon)' }}><Settings /></span>
                    <span>{t('settings')}</span>
                  </button>
                </>
              )}
            </nav>

            <div className="sidebar-footer" style={{ borderTop: '1px solid var(--border)', padding: '16px 20px' }}>
              <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
                <span className="avatar">{(user.name || 'U').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="truncate" style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 13, color: 'var(--text-0)' }}>{user.name}</div>
                  <div className="truncate" style={{ fontSize: 11, color: 'var(--text-3)' }}>{user.email}</div>
                </div>
              </div>
              <button
                onClick={logout}
                className="side-link"
                style={{ color: 'var(--red)' }}
              >
                <LogOut />
                <span>Log out</span>
              </button>
            </div>
          </aside>

          {/* MAIN CONTENT DISPLAY */}
          <main className="app-main flex-1 p-4 pb-24 md:p-6 overflow-y-auto overflow-x-hidden space-y-6" style={{ minWidth: 0 }}>

            {/* Top Workspace Header Bar */}
            {/* marginBottom trimmed specifically on the Dashboard tab (in
                place of the mb-6/24px default) as part of fitting the
                dashboard's card grid on one screen without scrolling -
                every other tab keeps the normal mb-6 spacing. */}
            <header className="app-topbar flex justify-between items-center mb-6 relative z-50" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18, padding: '14px 20px', ...(activeTab === 'dashboard' ? { marginBottom: 12 } : {}) }}>
              <div className="flex items-center gap-2 header-search-wrap" style={{ minWidth: 0, flex: 1 }}>
                <button className="icon-btn md:hidden" onClick={() => setMobileNavOpen(v => !v)} style={{ flexShrink: 0 }}>
                  <Menu />
                </button>
                {/* The global "jump to" search only makes sense on the
                    Dashboard: it exists to launch you into the right screen
                    (Customers / Keys / Inventory) for a query typed from the
                    landing page. Every other screen already has its own,
                    fully independent search box, so showing this one there
                    too was causing the same characters to visibly appear in
                    two search fields at once. Hiding it everywhere except
                    Dashboard keeps every page's search 100% self-contained. */}
                {activeTab === 'dashboard' ? (
                  <div className="global-search-form" style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => setSearchTypeMenuOpen(v => !v)}
                        className="search-type-trigger"
                        title="Search by"
                      >
                        {(() => {
                          const active = SEARCH_TYPE_OPTIONS.find(o => o.value === globalSearchType) || SEARCH_TYPE_OPTIONS[0];
                          const ActiveIcon = active.icon;
                          return (
                            <>
                              <ActiveIcon className="h-3.5 w-3.5" />
                              <span className="search-type-label">{active.label}</span>
                            </>
                          );
                        })()}
                      </button>
                      {searchTypeMenuOpen && (
                        <>
                          <div className="search-type-backdrop" onClick={() => setSearchTypeMenuOpen(false)} />
                          <div className="search-type-menu card animate-fade-in">
                            {SEARCH_TYPE_OPTIONS.map(opt => {
                              const OptIcon = opt.icon;
                              return (
                                <button
                                  type="button"
                                  key={opt.value}
                                  className={`search-type-item ${globalSearchType === opt.value ? 'active' : ''}`}
                                  onClick={() => { setGlobalSearchType(opt.value); setSearchTypeMenuOpen(false); }}
                                >
                                  <OptIcon className="h-3.5 w-3.5" />
                                  <span>{opt.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="input-wrap global-search-input" style={{ flex: 1, minWidth: 0, margin: 0 }}>
                      <Search />
                      <input
                        type="text"
                        value={globalSearchQuery}
                        onChange={(e) => setGlobalSearchQuery(e.target.value)}
                        onFocus={() => setSearchTypeMenuOpen(false)}
                        placeholder={`Search by ${globalSearchType === 'all' ? 'anything' : globalSearchType === 'productType' ? 'product type' : globalSearchType}\u2026`}
                      />
                    </div>

                    {/* Results overview - appears under the search box for any
                        query of 2+ characters, listing matches across every
                        entity type. Nothing here navigates until a specific
                        row is tapped. */}
                    {globalSearchQuery.trim().length >= 2 && (
                      <>
                        <div className="search-type-backdrop" onClick={() => setGlobalSearchQuery('')} />
                        <div className="global-search-results card animate-fade-in">
                          {globalSearchLoading ? (
                            <div className="global-search-results-status">
                              <RefreshCw className="animate-spin h-3.5 w-3.5" />
                              <span>Searching…</span>
                            </div>
                          ) : globalSearchResults.length === 0 ? (
                            <div className="global-search-results-status">
                              <span>No matching records found</span>
                            </div>
                          ) : (
                            <div className="global-search-results-list">
                              {globalSearchResults.map(r => {
                                const meta = GLOBAL_SEARCH_RESULT_META[r.type];
                                const ResultIcon = meta.icon;
                                return (
                                  <button
                                    type="button"
                                    key={r.key}
                                    className="global-search-result-item"
                                    onClick={() => handleGlobalSearchResultClick(r)}
                                  >
                                    <div className="icon-badge" style={{ width: 32, height: 32, flexShrink: 0 }}>
                                      <ResultIcon className="h-3.5 w-3.5" />
                                    </div>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                      <div className="global-search-result-title truncate">{r.title || '—'}</div>
                                      <div className="global-search-result-sub truncate">
                                        {[r.line2, r.line3].filter(Boolean).join(' \u00b7 ')}
                                      </div>
                                    </div>
                                    <span className="global-search-result-type-tag">{meta.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  // No search panel on this screen - fill the otherwise-empty
                  // header center with workspace context instead of blank space.
                  <div className="header-page-title truncate">
                    {user.role === 'SUPER_ADMIN' ? 'Key Shop' : (shopDisplayName || user.name)}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 relative app-topbar-actions">
                {/* Notification Bell */}
                <button
                  onClick={() => setShowNotifDropdown(!showNotifDropdown)}
                  className="icon-btn"
                  style={{ position: 'relative', width: 38, height: 38 }}
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span style={{ position: 'absolute', top: -5, right: -5, background: 'var(--red)', color: '#fff', fontWeight: 800, fontSize: 9, width: 17, height: 17, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--card)' }} className="animate-pulse">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {/* Notifications dropdown popup overlay */}
                {showNotifDropdown && (
                  <div className="card animate-fade-in" style={{ position: 'absolute', right: 0, top: 46, width: 'min(320px, calc(100vw - 32px))', padding: 16, zIndex: 9999, textAlign: 'left' }}>
                    <div className="flex justify-between items-center" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 10 }}>
                      <h3 style={{ fontSize: 13 }}>Notifications</h3>
                      {unreadCount > 0 && (
                        <button
                          onClick={async () => {
                            try {
                              for (const n of notifications) {
                                if (!n.isRead) {
                                  if (user.role === 'SUPER_ADMIN') {
                                    await api.markSuperNotificationRead(n.id);
                                  } else {
                                    await api.markNotificationRead(n.id);
                                  }
                                }
                              }
                              fetchNotifications();
                            } catch (e) {
                              console.error(e);
                            }
                          }}
                          style={{ fontSize: 10, fontWeight: 800, color: 'var(--gold)', textTransform: 'uppercase' }}
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {notifications.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, padding: '24px 0' }}>No notifications found</div>
                      ) : (
                        notifications.map(n => (
                          <div
                            key={n.id}
                            onClick={async () => {
                              try {
                                if (user.role === 'SUPER_ADMIN') {
                                  await api.markSuperNotificationRead(n.id);
                                } else {
                                  await api.markNotificationRead(n.id);
                                }
                                fetchNotifications();
                                if (n.type === 'SHOP_REGISTRATION' && user.role === 'SUPER_ADMIN') {
                                  setActiveTab('shops');
                                }
                                if (n.type === 'CUSTOMER_REGISTRATION' && user.role !== 'SUPER_ADMIN') {
                                  setActiveTab('history');
                                }
                                setShowNotifDropdown(false);
                              } catch (e) {
                                console.error(e);
                              }
                            }}
                            style={{
                              padding: 10, borderRadius: 13, cursor: 'pointer', fontSize: 11.5, transition: 'background .18s ease',
                              background: !n.isRead ? 'var(--gold-dim)' : 'var(--card-2)',
                              border: `1px solid ${!n.isRead ? 'rgba(240,185,11,0.25)' : 'var(--border-2)'}`
                            }}
                          >
                            <div className="flex justify-between items-start" style={{ marginBottom: 3, fontWeight: 700, color: 'var(--text-0)' }}>
                              <span>{n.title}</span>
                              <span style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'monospace', fontWeight: 400 }}>
                                {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p style={{ color: 'var(--text-2)', fontSize: 10.5, lineHeight: 1.5 }}>{n.message}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                <span className="avatar">{(user.name || 'U').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span>
              </div>
            </header>

            {activeTab === 'dashboard' && <DashboardView t={t} setActiveTab={setActiveTab} setSearchDispatch={setSearchDispatch} />}
            {activeTab === 'shops' && <ShopsManagementView t={t} api={api} initiallyOpenAddModal={autoOpenShopModal} onCloseInitiallyOpen={() => setAutoOpenShopModal(false)} searchDispatch={searchDispatch} />}
            {activeTab === 'super-customers' && <SuperCustomersView t={t} api={api} searchDispatch={activeTab === 'super-customers' ? searchDispatch : null} />}
            {activeTab === 'keys' && <KeysCatalogView t={t} api={api} searchDispatch={activeTab === 'keys' ? searchDispatch : null} />}
            {activeTab === 'pricing-offers' && <PricingOffersView t={t} api={api} />}
            {activeTab === 'revenue' && <RevenueManagementView t={t} api={api} />}
            {activeTab === 'promotions' && <PromotionsView t={t} api={api} user={user} searchDispatch={activeTab === 'promotions' ? searchDispatch : null} />}
            {activeTab === 'search-keys' && <KeysSearchView t={t} api={api} searchDispatch={activeTab === 'search-keys' ? searchDispatch : null} />}
            {activeTab === 'register' && <CustomerRegistrationWizard t={t} api={api} />}
            {activeTab === 'history' && <CustomerHistoryView t={t} api={api} searchDispatch={activeTab === 'history' ? searchDispatch : null} />}
            {activeTab === 'reports' && <ReportsPortalView t={t} api={api} />}
            {activeTab === 'customer-care' && <CustomerCareView t={t} api={api} />}
            {activeTab === 'support-config' && <SupportConfigView t={t} api={api} />}
            {activeTab === 'settings' && <ShopSettingsView t={t} api={api} />}
          </main>

          {/* Mobile Bottom Navigation Bar (mobile only) */}
          <nav className="mobile-bottom-nav md:hidden">
            <button
              className={`mbn-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => { resetToDashboard(); setMobileNavOpen(false); }}
            >
              <span className="nav-ico-sm" style={{ background: 'var(--maroon)' }}><Home /></span>
              <span>Dashboard</span>
            </button>
            <button
              className={`mbn-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => { setActiveTab('settings'); setMobileNavOpen(false); }}
            >
              <span className="nav-ico-sm" style={{ background: 'var(--purple)' }}><User /></span>
              <span>Account</span>
            </button>
            <button
              className="mbn-item"
              onClick={() => setShowLangDialog(true)}
            >
              <span className="nav-ico-sm" style={{ background: 'var(--teal)' }}><Languages /></span>
              <span>Language</span>
            </button>
            <button
              className={`mbn-item ${(user.role === 'SUPER_ADMIN' ? activeTab === 'support-config' : activeTab === 'customer-care') ? 'active' : ''}`}
              onClick={() => {
                // Role-based destination: Super Admin manages the global
                // support config (WhatsApp number + training videos), while
                // Shop Admin only views the already-configured contact info.
                setActiveTab(user.role === 'SUPER_ADMIN' ? 'support-config' : 'customer-care');
                setMobileNavOpen(false);
              }}
            >
              <span className="nav-ico-sm" style={{ background: 'var(--rose)' }}><Headset /></span>
              <span>Customer Service</span>
            </button>
          </nav>

          {/* "Press Back again to exit" toast - shown only when the hardware
              Back button/gesture is pressed once while already on the
              Dashboard/home screen (see the backButton listener above). */}
          {exitPromptVisible && createPortal(
            <div
              style={{
                position: 'fixed',
                left: '50%',
                bottom: 88,
                transform: 'translateX(-50%)',
                background: 'rgba(20,18,16,0.92)',
                color: '#fff',
                padding: '10px 18px',
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                zIndex: 9999,
                pointerEvents: 'none',
                boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
              }}
            >
              Press Back again to exit
            </div>,
            document.body
          )}

          {/* Language selection dialog (center-screen modal) */}
          {showLangDialog && createPortal(
            <div
              className="fixed inset-0 z-50 overflow-y-auto flex justify-center items-center p-4"
              style={{ background: 'rgba(5,4,3,0.72)' }}
              onClick={() => setShowLangDialog(false)}
            >
              <div
                ref={langDialogCardRef}
                className="card animate-fade-in"
                style={{ width: '100%', maxWidth: 340, padding: 24, position: 'relative' }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setShowLangDialog(false)}
                  className="icon-btn"
                  style={{ position: 'absolute', top: 16, right: 16 }}
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="flex flex-col items-center mb-5" style={{ textAlign: 'center' }}>
                  <div className="icon-badge solid" style={{ marginBottom: 10 }}><Languages /></div>
                  <h2 style={{ fontSize: 17 }}>Choose Language</h2>
                  <p style={{ color: 'var(--text-3)', fontSize: 12, fontWeight: 600, marginTop: 4 }}>Select your preferred language for the app</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { code: 'en', label: 'English' },
                    { code: 'hi', label: 'Hindi (हिन्दी)' },
                    { code: 'ta', label: 'Tamil (தமிழ்)' },
                    { code: 'te', label: 'Telugu (తెలుగు)' },
                    { code: 'kn', label: 'Kannada (ಕನ್ನಡ)' },
                    { code: 'ml', label: 'Malayalam (മലയാളം)' },
                  ].map(l => (
                    <button
                      key={l.code}
                      onClick={() => { setLang(l.code); localStorage.setItem('kee_lang', l.code); setShowLangDialog(false); }}
                      className={`lang-option-btn ${lang === l.code ? 'active' : ''}`}
                    >
                      <span>{l.label}</span>
                      {lang === l.code && <Check className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
      )}
    </>
  );
}

// ============================================================================
// COMPONENT 1: DASHBOARD VIEW WITH INTERACTIVE CARD DETAILS
// ============================================================================
// Product-type shortcut cards shown on both the Shop Admin and Super Admin
// dashboards. `type` values must exactly match a product type name managed
// by the Super Admin (Support > Product Types, see PromotionsFeed below) so
// tapping a card can route straight into the Inventory screen pre-filtered
// to that category via searchDispatch.
// Flat two-tone "add customer" glyph (light-blue head/shoulders + a white
// plus-badge) used on the New/Add Customer cards on both dashboards,
// mirroring the look of the reference design the user asked for. This is
// original vector artwork drawn from scratch (plain circles/paths), not a
// copy of any third-party icon asset, so it carries none of the licensing
// concerns that reusing someone else's app screenshot/icon file would.
function AddCustomerIcon() {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <circle cx="30" cy="22" r="13" fill="#29B6F6" />
      <path d="M8 56c0-13.3 9.8-21 22-21s22 7.7 22 21" fill="#1E88E5" />
      <circle cx="47" cy="45" r="13" fill="#ffffff" stroke="#1565C0" strokeWidth="3" />
      <path d="M47 39v12M41 45h12" stroke="#1565C0" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

// Flat two-tone "browser window + key search" glyph used on the Search Keys
// dashboard card - a magnifying glass with a small key inside it, sitting
// over a browser-style window with a couple of UI-block accents, mirroring
// the reference design the user asked to match. Original vector artwork
// (plain shapes/paths), matching the AddCustomerIcon pattern above.
function SearchKeysIcon() {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="8" width="52" height="40" rx="7" fill="#fff" stroke="#7A1220" strokeWidth="3" />
      <rect x="6" y="8" width="52" height="12" rx="7" fill="#7A1220" />
      <circle cx="14" cy="14" r="1.6" fill="#fff" /><circle cx="19" cy="14" r="1.6" fill="#fff" /><circle cx="24" cy="14" r="1.6" fill="#fff" />
      <rect x="38" y="28" width="12" height="9" rx="2" fill="none" stroke="#C89416" strokeWidth="2" />
      <line x1="38" y1="42" x2="52" y2="42" stroke="#C89416" strokeWidth="2" strokeLinecap="round" />
      <g transform="translate(24,32)">
        <circle r="11" fill="#fff" stroke="#7A1220" strokeWidth="3" />
        <line x1="8" y1="8" x2="17" y2="17" stroke="#7A1220" strokeWidth="4" strokeLinecap="round" />
        <g transform="rotate(-40)">
          <circle cx="-5" cy="0" r="3.6" fill="none" stroke="#C89416" strokeWidth="2" />
          <line x1="-1.4" y1="0" x2="6" y2="0" stroke="#C89416" strokeWidth="2" strokeLinecap="round" />
          <line x1="4" y1="0" x2="4" y2="3" stroke="#C89416" strokeWidth="2" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}

const DASHBOARD_PRODUCT_CARDS = [
  { type: 'Used Machines', icon: Wrench, image: usedMachinesImg, description: 'View and manage used machines' },
  { type: 'ECM Service', icon: Cpu, image: ecmServiceImg, description: 'Manage ECM service records' },
  // imgScale: the Meter Service product photo has more transparent
  // padding baked into the source image than the other three, so at the
  // shared .icon-badge.photo size it reads visibly smaller than its
  // siblings even though the box is identical - a small CSS scale-up
  // (applied to the <img> only, box size untouched) compensates for that
  // without affecting Used Machines/ECM/Scanning.
  { type: 'Meter Service', icon: Gauge, image: meterServiceImg, description: 'Track and manage meter services', imgScale: 1.14 },
  { type: 'Scanning Service', icon: ScanLine, image: scanningServiceImg, description: 'Scan & process compliance entries' },
];

// Generic 2-column "info card" grid used across the dashboards - an icon
// badge top-left, a bold title, and a short description underneath. Used for
// the product-type shortcuts, the shop-admin quick actions, and the
// subscription/inventory shortcuts so all of these read as one consistent
// card language. When an item provides an `image` (see
// DASHBOARD_PRODUCT_CARDS), that photo fills the badge instead of the
// lucide icon, so cards like "Used Machines" show an actual product photo
// rather than a generic outline glyph.
function DashCardGrid({ items }) {
  return (
    <div className="dash-card-grid">
      {items.map((item, idx) => {
        const Icon = item.icon;
        return (
          <button
            key={idx}
            type="button"
            className={`dash-card animate-fade-in${item.fullWidth ? ' dash-card-full' : ''}`}
            style={{ animationDelay: `${idx * 0.05}s` }}
            onClick={item.onClick}
          >
            {item.image ? (
              <div className={`icon-badge photo${item.compact ? ' compact' : ''}`}>
                <img src={item.image} alt="" style={item.imgScale ? { transform: `scale(${item.imgScale})` } : undefined} />
              </div>
            ) : (
              <div className={`icon-badge big${item.iconVariant ? ` ${item.iconVariant}` : ''}${item.compact ? ' compact' : ''}`}><Icon /></div>
            )}
            <div className="dash-card-title">{item.title}</div>
            <div className="dash-card-desc">{item.description}</div>
          </button>
        );
      })}
    </div>
  );
}

function DashboardView({ t, setActiveTab, setSearchDispatch }) {
  const { user, api } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePopupAd, setActivePopupAd] = useState(null);

  // Tapping a product-type card jumps to the Inventory screen and
  // auto-filters it to that category - reuses the same searchDispatch
  // mechanism the global header search uses (see the App component).
  const goToProductType = (productType) => {
    setSearchDispatch({ query: productType, type: 'productType', nonce: Date.now() });
    setActiveTab('promotions');
  };

  useEffect(() => {
    if (activePopupAd) {
      const timer = setTimeout(() => {
        sessionStorage.setItem(`dismissed_ad_${activePopupAd.id}`, 'true');
        setActivePopupAd(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [activePopupAd]);

  useEffect(() => {
    fetchDashboardData();
    if (user.role === 'SHOP_ADMIN') {
      fetchPopupAds();
    }
  }, [user]);

  const fetchPopupAds = async () => {
    try {
      const ads = await api.getAdvertisements();
      const popups = ads.filter(ad => ad.type === 'POPUP');
      if (popups.length > 0) {
        const sorted = popups.sort((a, b) => b.priority - a.priority);
        const dismissed = sessionStorage.getItem(`dismissed_ad_${sorted[0].id}`);
        if (!dismissed) {
          setActivePopupAd(sorted[0]);
        }
      }
    } catch (e) {
      console.error('Failed to fetch advertisements for popup', e);
    }
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const res = await api.getDashboard();
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
        <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Loading dashboard…</span>
      </div>
    );
  }

  if (user.role === 'SUPER_ADMIN') {
    return (
      <div className="animate-fade-in">
        {/* Dashboard-only compaction: page-head is shared across 16 other
            screens (list/table pages that scroll freely and want the full
            20px breathing room), so it's trimmed here via inline style
            rather than editing the shared class - part of fitting the
            dashboard's card grid on one screen without scrolling. */}
        <div className="page-head" style={{ marginBottom: 10 }}>
          <div>
            <div className="eyebrow"><Shield /> Super Admin Control</div>
            <h1>Welcome back, {(user.name || 'Admin').split(' ')[0]} 👋</h1>
            <p>{t('superAdmin')} Portal — platform overview across every tenant shop.</p>
          </div>
        </div>

        {/* Compact, approved dashboard layout - only the essential shortcut
            cards, no reports/lists/charts below. New Customer first, then
            Shops (2nd card), then the 4 product-category shortcuts (6 cards
            = exactly 3 full rows in the 2-column grid), then a full-width,
            shorter Customer Support card spanning both columns. All cards
            share the same size/spacing via DashCardGrid. */}
        <DashCardGrid items={[
          { title: 'New Customer', description: 'Register a compliance entry for new customer', icon: AddCustomerIcon, iconVariant: 'flat-icon', onClick: () => setActiveTab('super-customers') },
          { title: 'Shops', description: 'View and manage every registered shop', image: keyShopLogo, onClick: () => setActiveTab('shops') },
          ...DASHBOARD_PRODUCT_CARDS.map(c => ({ title: c.type, description: c.description, icon: c.icon, image: c.image, onClick: () => goToProductType(c.type) })),
          { title: 'Customer Support', description: 'Manage the customer support contact & resources', image: customerSupportIcon, fullWidth: true, compact: true, onClick: () => setActiveTab('support-config') },
        ]} />
      </div>
    );
  }

  // SHOP ADMIN DASHBOARD
  const sub = data.subscription;
  const firstName = (user.name || 'there').split(' ')[0];
  return (
    <div className="animate-fade-in">
      {/* Dashboard-only compaction: page-head is shared across 16 other
          screens (list/table pages that scroll freely and want the full
          20px breathing room), so it's trimmed here via inline style
          rather than editing the shared class - part of fitting the
          dashboard's card grid on one screen without scrolling. */}
      <div className="page-head" style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src={keyShopLogo} alt="Key Shop" style={{ width: 58, height: 58, objectFit: 'contain', flexShrink: 0 }} />
          <div>
            <div className="eyebrow"><Store /> {t('shopTerminal')}</div>
            <h1>Namaste, {firstName} 👋</h1>
            <p>{data.shop ? data.shop.name : `${t('shopTerminal')} Workspace`} — compliance &amp; inventory terminal</p>
          </div>
        </div>
      </div>

      {sub && sub.daysRemaining <= 7 && (
        <div className="card" style={{ marginBottom: 10, padding: 14, borderColor: 'rgba(240,185,11,0.4)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div className="icon-badge rose"><AlertTriangle /></div>
            <div>
              <p style={{ fontFamily: 'var(--display)', fontWeight: 700, color: 'var(--text-0)', fontSize: 14 }}>Subscription Renewal Required!</p>
              <p style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, marginTop: 2 }}>
                Your shop subscription expires in <b style={{ color: 'var(--gold)' }}>{sub.daysRemaining} days</b>. Please coordinate renewal with Key Shop Super Admin.
              </p>
            </div>
          </div>
          <div className="pill-badge">
            <span className="dot"></span>
            {sub.plan} Plan
          </div>
        </div>
      )}

      {/* Compact, approved dashboard layout - only the essential shortcut cards,
          no reports/lists/charts below. One combined grid so every card shares
          the same size/spacing: Quick Actions (New Customer, Search Keys), the
          4 product-category shortcuts, then a full-width, shorter Customer
          Support card spanning both columns. */}
      <DashCardGrid items={[
        { title: 'New Customer', description: 'Register a compliance entry for new customer', icon: AddCustomerIcon, iconVariant: 'flat-icon', onClick: () => setActiveTab('register') },
        { title: 'Search Keys', description: 'Find and digitize key records quickly', icon: SearchKeysIcon, iconVariant: 'flat-icon', onClick: () => setActiveTab('search-keys') },
        ...DASHBOARD_PRODUCT_CARDS.map(c => ({ title: c.type, description: c.description, icon: c.icon, image: c.image, onClick: () => goToProductType(c.type) })),
        { title: 'Customer Support', description: 'Get help & view support contact details', image: customerSupportIcon, fullWidth: true, compact: true, onClick: () => setActiveTab('customer-care') },
      ]} />

      {/* Active Announcement Popup Modal */}
      {activePopupAd && createPortal(
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/85 backdrop-blur-md flex justify-center items-center p-4 md:p-10">
          <div className="card animate-fade-in" style={{ width: 'clamp(320px, 60vw, 680px)', padding: 0, overflow: 'hidden', margin: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div style={{ position: 'relative' }}>
              <img src={cleanGoogleImageUrl(activePopupAd.imageUrl)} alt={activePopupAd.title} style={{ width: '100%', height: 240, objectFit: 'cover', opacity: 0.9 }} />
              <div style={{ position: 'absolute', top: 12, right: 12 }}>
                <button
                  onClick={() => {
                    sessionStorage.setItem(`dismissed_ad_${activePopupAd.id}`, 'true');
                    setActivePopupAd(null);
                  }}
                  className="icon-btn"
                  style={{ background: 'rgba(10,9,8,0.6)' }}
                >
                  <X />
                </button>
              </div>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 64, background: 'linear-gradient(to top, var(--card), transparent)' }}></div>
            </div>

            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <span className="badge badge-gold" style={{ alignSelf: 'flex-start' }}>
                <Sparkles style={{ width: 11, height: 11 }} /> Featured Announcement
              </span>
              <h3 style={{ fontSize: 17 }}>{activePopupAd.title}</h3>
              <p style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, lineHeight: 1.5 }}>
                Special promotion from Key Shop Headquarters for duplicate key shop workspaces. Upgrade inventory stock or log compliance checks to qualify.
              </p>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', gap: 10 }}>
                <button
                  onClick={() => {
                    sessionStorage.setItem(`dismissed_ad_${activePopupAd.id}`, 'true');
                    setActivePopupAd(null);
                  }}
                  className="btn btn-ghost btn-block"
                >
                  Dismiss Offer
                </button>
                <button
                  onClick={() => {
                    sessionStorage.setItem(`dismissed_ad_${activePopupAd.id}`, 'true');
                    setActivePopupAd(null);
                    setActiveTab('promotions');
                  }}
                  className="btn btn-primary btn-block"
                >
                  View Details
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ============================================================================
// COMPONENT 2: SHOPS MANAGEMENT WITH OPTIMIZED CENTERED FIXED DIALOG
// ============================================================================
function ShopsManagementView({ t, api, initiallyOpenAddModal, onCloseInitiallyOpen, searchDispatch }) {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  // Client-side live search - the full shop list is already fetched in one
  // call, so filtering happens instantly on every keystroke with no round-trip.
  const [shopSearchQuery, setShopSearchQuery] = useState('');

  // Picks up a query dispatched from the global header search panel (filter = "Shop").
  useEffect(() => {
    if (searchDispatch && searchDispatch.type === 'shop') {
      setShopSearchQuery(searchDispatch.query);
    }
  }, [searchDispatch?.nonce]);

  useEffect(() => {
    if (initiallyOpenAddModal) {
      setShowAddModal(true);
      if (onCloseInitiallyOpen) onCloseInitiallyOpen();
    }
  }, [initiallyOpenAddModal]);
  const [showSubModal, setShowSubModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false); // Edit shop profile
  const [selectedShop, setSelectedShop] = useState(null);
  useBackHandler(showAddModal, () => setShowAddModal(false));
  useBackHandler(showSubModal, () => setShowSubModal(false));
  useBackHandler(showEditModal, () => setShowEditModal(false));

  // Form States for Add Shop
  const [shopName, setShopName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [subPlan, setSubPlan] = useState('MONTHLY');
  const [subEndDate, setSubEndDate] = useState('');
  const [provisionPhone, setProvisionPhone] = useState('');
  const [provisionWhatsapp, setProvisionWhatsapp] = useState('');
  const [provisionLocation, setProvisionLocation] = useState('');
  const [provisionSameAsPhone, setProvisionSameAsPhone] = useState(false);
  const [provisionShopPhoto, setProvisionShopPhoto] = useState('');
  const [provisionShopLicense, setProvisionShopLicense] = useState('');
  const [provisionOwnerAadhaar, setProvisionOwnerAadhaar] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Form States for Edit Shop Details (Super Admin capability)
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editGst, setEditGst] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editShopPhoto, setEditShopPhoto] = useState('');
  const [editShopLicense, setEditShopLicense] = useState('');
  const [editOwnerAadhaar, setEditOwnerAadhaar] = useState('');
  const [editShopPhotoName, setEditShopPhotoName] = useState('');
  const [editShopLicenseName, setEditShopLicenseName] = useState('');
  const [editOwnerAadhaarName, setEditOwnerAadhaarName] = useState('');

  // Form States for Subscription management
  const [newPlan, setNewPlan] = useState('MONTHLY');
  const [newEndDate, setNewEndDate] = useState('');

  // Plan Prices configuration loaded from system settings
  const [planPrices, setPlanPrices] = useState({ MONTHLY: 49, HALF_YEARLY: 269, YEARLY: 499 });

  // Payment integration states for new shop provision
  const [showPaymentProvisionModal, setShowPaymentProvisionModal] = useState(false);
  useBackHandler(showPaymentProvisionModal, () => setShowPaymentProvisionModal(false));
  const [provisionDto, setProvisionDto] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [processingLog, setProcessingLog] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');

  const fetchPlanPrices = async () => {
    try {
      const res = await api.getPlanPrices();
      setPlanPrices(res);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchShops();
    fetchPlanPrices();
  }, []);

  // Automatic End Date Updater for Shop Creation Form
  useEffect(() => {
    const calculateEndDate = () => {
      const now = new Date();
      if (subPlan === 'MONTHLY') {
        now.setMonth(now.getMonth() + 1);
      } else if (subPlan === 'HALF_YEARLY') {
        now.setMonth(now.getMonth() + 6);
      } else if (subPlan === 'YEARLY') {
        now.setFullYear(now.getFullYear() + 1);
      }
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      setSubEndDate(`${yyyy}-${mm}-${dd}`);
    };
    calculateEndDate();
  }, [subPlan]);

  // Automatic End Date Updater for Plan Updates Form
  useEffect(() => {
    const calculateNewEndDate = () => {
      const now = new Date();
      if (newPlan === 'MONTHLY') {
        now.setMonth(now.getMonth() + 1);
      } else if (newPlan === 'HALF_YEARLY') {
        now.setMonth(now.getMonth() + 6);
      } else if (newPlan === 'YEARLY') {
        now.setFullYear(now.getFullYear() + 1);
      }
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      setNewEndDate(`${yyyy}-${mm}-${dd}`);
    };
    calculateNewEndDate();
  }, [newPlan]);

  const fetchShops = async () => {
    setLoading(true);
    try {
      const res = await api.getShops();
      setShops(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const executeShopCreation = async (dto) => {
    try {
      await api.createShop(dto);
      setShowAddModal(false);
      resetAddForm();
      fetchShops();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to create key shop. Try again.');
      throw err;
    }
  };

  const handleCreateShopSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      if (!PHONE_REGEX.test(provisionPhone)) {
        alert(`Phone number: ${PHONE_REGEX_MESSAGE}`);
        return;
      }
      if (provisionWhatsapp && !PHONE_REGEX.test(provisionWhatsapp)) {
        alert(`WhatsApp number: ${PHONE_REGEX_MESSAGE}`);
        return;
      }

      if (!provisionOwnerAadhaar) {
        alert('Owner Aadhaar document is mandatory to provision a shop workspace.');
        return;
      }

      const formattedEndDate = new Date(subEndDate).toISOString();
      // Verification documents are NOT embedded in companyDetails anymore -
      // they're sent as separate top-level DTO fields and persisted by the
      // backend as real files + ShopDocument rows (see
      // ShopService.createShop / persistShopDocuments).
      const companyDetails = JSON.stringify({
        address: provisionLocation,
        gst: 'Pending',
        phone: provisionPhone,
        whatsappNumber: provisionWhatsapp,
      });
      const dto = {
        name: shopName,
        adminEmail,
        adminName,
        adminPassword,
        plan: subPlan,
        endDate: formattedEndDate,
        companyDetails,
        themeColor: '#C89416',
        shopPhoto: provisionShopPhoto,
        shopLicense: provisionShopLicense,
        ownerAadhaar: provisionOwnerAadhaar
      };

      const price = planPrices[subPlan] ?? 0;
      if (price > 0) {
        setProvisionDto(dto);
        setShowPaymentProvisionModal(true);
        setPaymentSuccess(false);
        setPaymentProcessing(false);
        setProcessingLog('');
      } else {
        await executeShopCreation(dto);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to initialize subscription checkout. Try again.');
    }
  };

  const executePaymentProvision = async (e) => {
    e.preventDefault();
    setPaymentProcessing(true);

    const logs = [
      'Establishing secure end-to-end sandbox tunnel...',
      'Verifying account balance & credit lines...',
      'Authorizing subscription escrow settlement transaction...',
      'Encrypting card details via AES-GCM...',
      'Fulfilling Key Shop API workspace provisioning...'
    ];

    for (let i = 0; i < logs.length; i++) {
      setProcessingLog(logs[i]);
      await new Promise(r => setTimeout(r, 600));
    }

    try {
      await executeShopCreation(provisionDto);
      setPaymentProcessing(false);
      setPaymentSuccess(true);
    } catch (err) {
      setPaymentProcessing(false);
      alert(`Payment failed: ${err.message}`);
    }
  };

  const resetAddForm = () => {
    setShopName('');
    setAdminEmail('');
    setAdminName('');
    setAdminPassword('');
    setSubPlan('MONTHLY');
    setSubEndDate('');
    setProvisionPhone('');
    setProvisionWhatsapp('');
    setProvisionLocation('');
    setProvisionSameAsPhone(false);
    setProvisionShopPhoto('');
    setProvisionShopLicense('');
    setProvisionOwnerAadhaar('');
    setErrorMsg('');
  };

  const toggleShopStatus = async (shop) => {
    try {
      await api.suspendShop(shop.id, !shop.isActive);
      fetchShops();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleUpdateSubscriptionSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.updateSubscription(selectedShop.id, {
        plan: newPlan,
        status: 'ACTIVE',
        startDate: new Date().toISOString(),
        endDate: new Date(newEndDate).toISOString()
      });
      setShowSubModal(false);
      fetchShops();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleEditShopClick = (shop) => {
    setSelectedShop(shop);
    setEditName(shop.name);

    if (shop.companyDetails) {
      try {
        const details = JSON.parse(shop.companyDetails);
        setEditAddress(details.address || '');
        setEditGst(details.gst || '');
        setEditPhone(details.phone || '');
      } catch (err) {
        setEditAddress('');
        setEditGst('');
        setEditPhone('');
      }
    } else {
      setEditAddress('');
      setEditGst('');
      setEditPhone('');
    }

    // Verification documents are read-only in this modal (review/download
    // only - no re-upload here) and now come from the relational
    // ShopDocument table (shop.documents), not companyDetails JSON.
    const findDoc = (documentType) => (shop.documents || []).find((d) => d.documentType === documentType);
    const shopPhotoDoc = findDoc('SHOP_PHOTO');
    const shopLicenseDoc = findDoc('SHOP_LICENSE');
    const ownerAadhaarDoc = findDoc('OWNER_AADHAAR');
    setEditShopPhoto(shopPhotoDoc ? shopPhotoDoc.fileUrl : '');
    setEditShopLicense(shopLicenseDoc ? shopLicenseDoc.fileUrl : '');
    setEditOwnerAadhaar(ownerAadhaarDoc ? ownerAadhaarDoc.fileUrl : '');
    setEditShopPhotoName(shopPhotoDoc ? shopPhotoDoc.originalName : '');
    setEditShopLicenseName(shopLicenseDoc ? shopLicenseDoc.originalName : '');
    setEditOwnerAadhaarName(ownerAadhaarDoc ? ownerAadhaarDoc.originalName : '');

    setShowEditModal(true);
  };

  const handleEditShopSubmit = async (e) => {
    e.preventDefault();
    if (!PHONE_REGEX.test(editPhone)) {
      alert(PHONE_REGEX_MESSAGE);
      return;
    }
    try {
      // Verification documents are managed separately (relational
      // ShopDocument table) and aren't editable from this form - only
      // address/phone metadata is persisted here.
      const companyDetails = JSON.stringify({
        address: editAddress,
        phone: editPhone,
      });

      await api.updateShop(selectedShop.id, {
        name: editName,
        companyDetails
      });
      setShowEditModal(false);
      fetchShops();
    } catch (err) {
      alert(err.message || 'Update failed');
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Layers /> Platform Operations</div>
          <h1>{t('shops')}</h1>
          <p>Provision, monitor and manage every key shop workspace on the Key Shop platform.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn btn-primary"
        >
          <Plus />
          <span>Provision New Shop</span>
        </button>
      </div>

      {/* Search box stays mounted regardless of loading/results state so it
          never loses focus while typing. Filtering is instant/client-side
          (partial, case-insensitive match) since the whole shop list is
          already in memory. */}
      <div className="card table-card">
        <div className="table-head">
          <h2 style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 17 }}>
            All Shops <span style={{ color: 'var(--text-3)', fontWeight: 700, fontSize: 13 }}>({shops.length})</span>
          </h2>
          <div className="search-box">
            <Search />
            <input
              type="text" value={shopSearchQuery} onChange={(e) => setShopSearchQuery(e.target.value)}
              placeholder="Search by shop name, admin name, or email&hellip;"
            />
          </div>
        </div>

        {(() => {
          const q = shopSearchQuery.trim().toLowerCase();
          const filteredShops = !q ? shops : shops.filter(s =>
            (s.name || '').toLowerCase().includes(q) ||
            (s.users?.[0]?.name || '').toLowerCase().includes(q) ||
            (s.users?.[0]?.email || '').toLowerCase().includes(q)
          );

          if (loading) {
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 200 }}>
                <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Loading shop registry…</span>
              </div>
            );
          }

          if (filteredShops.length === 0) {
            return (
              <p style={{ padding: 24, fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>
                {shops.length === 0
                  ? 'No shop workspaces provisioned yet. Use "Provision New Shop" to onboard your first tenant.'
                  : 'No shop workspaces match this search.'}
              </p>
            );
          }

          return (
          <table className="kee-table">
            <thead>
              <tr>
                <th>Shop Details</th>
                <th>Admin Contact</th>
                <th>Active Plan</th>
                <th>Valid Until</th>
                <th>Disk Storage</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredShops.map(s => (
                <tr key={s.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className={`icon-badge ${s.isActive ? 'jgreen' : 'rose'}`} style={{ width: 34, height: 34, borderRadius: 10 }}>
                        <Store style={{ width: 16, height: 16 }} />
                      </div>
                      <div>
                        <div className="cell-primary">{s.name}</div>
                        <div className="cell-sub">ID: {s.id}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="cell-primary" style={{ fontSize: 13 }}>{s.users?.[0]?.name || 'N/A'}</div>
                    <div className="cell-sub">{s.users?.[0]?.email || ''}</div>
                  </td>
                  <td>
                    <span className="badge badge-gold"><span className="dot" />{s.subscriptions?.[0]?.plan || 'N/A'}</span>
                  </td>
                  <td className="cell-sub" style={{ fontWeight: 700, color: 'var(--text-2)' }}>
                    {s.subscriptions?.[0]?.endDate ? new Date(s.subscriptions[0].endDate).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="cell-sub" style={{ fontWeight: 700, color: 'var(--text-2)' }}>
                    {(Number(s.storageUsed || 0) / (1024 * 1024)).toFixed(2)} MB
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={() => toggleShopStatus(s)}
                      title="Toggle shop active status"
                      className={`badge ${s.isActive ? 'badge-active' : 'badge-suspended'}`}
                      style={{ border: 'none', cursor: 'pointer' }}
                    >
                      <span className="dot" />{s.isActive ? 'Active' : 'Suspended'}
                    </button>
                  </td>
                  <td>
                    <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => handleEditShopClick(s)}
                        className="icon-btn"
                        title="Edit Workspace"
                      >
                        <Settings />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedShop(s);
                          setNewPlan(s.subscriptions?.[0]?.plan || 'MONTHLY');
                          setShowSubModal(true);
                        }}
                        className="icon-btn"
                        title="Manage Plan"
                      >
                        <DollarSign />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          );
        })()}
      </div>

      {showAddModal && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.82)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 640, margin: 'auto', padding: 28 }}>
            {/* Modal Header */}
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><Layers /> Shop Onboarding</span>
                <h2 style={{ fontSize: 19 }}>Provision New Shop Workspace</h2>
              </div>
              <button onClick={() => setShowAddModal(false)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            {errorMsg && (
              <div style={{ display: 'flex', gap: 8, background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.35)', padding: 10, borderRadius: 12, fontSize: 12, color: '#b91c1c', fontWeight: 600, marginBottom: 16 }}>
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateShopSubmit}>
              <div className="reg-section">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Store /></div><b>Shop Name <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="text" required value={shopName} onChange={(e) => setShopName(e.target.value)}
                      placeholder="e.g. Apex Duplicate Keys"
                    />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><MapPin /></div><b>Shop Address / Location <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="text" required value={provisionLocation} onChange={(e) => setProvisionLocation(e.target.value)}
                      placeholder="e.g. Metro Station Road, Sector 5"
                    />
                  </div>
                </div>
              </div>

              <div className="reg-section">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><User /></div><b>Admin Full Name <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="text" required value={adminName} onChange={(e) => setAdminName(e.target.value)}
                      placeholder="e.g. Ramesh Kumar"
                    />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Mail /></div><b>Admin Email <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="email" required value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="e.g. admin@apexkeys.com"
                    />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><Lock /></div><b>Initial Password <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="password" required value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="e.g. apexpassword123"
                    />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Phone /></div><b>Phone Number <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="tel" required value={provisionPhone} onChange={(e) => setProvisionPhone(e.target.value)}
                      placeholder="e.g. +91 99999 99999"
                    />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label">
                    <div className="reg-ico" style={{ background: 'var(--rose)' }}><Phone /></div>
                    <b>WhatsApp Number <span className="req">*</span></b>
                    <label className="reg-trailing">
                      <input
                        type="checkbox" checked={provisionSameAsPhone}
                        onChange={(e) => {
                          setProvisionSameAsPhone(e.target.checked);
                          if (e.target.checked) setProvisionWhatsapp(provisionPhone);
                        }}
                        style={{ accentColor: 'var(--gold)', width: 13, height: 13 }}
                      />
                      <span>Same as Phone</span>
                    </label>
                  </div>
                  <div className="input-wrap">
                    <input
                      type="tel" required value={provisionWhatsapp} onChange={(e) => setProvisionWhatsapp(e.target.value)}
                      disabled={provisionSameAsPhone} placeholder="WhatsApp Number"
                      style={{ opacity: provisionSameAsPhone ? 0.5 : 1 }}
                    />
                  </div>
                </div>
              </div>

              <div className="reg-section">
                <div className="form-grid">
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><DollarSign /></div><b>Subscription Plan <span className="req">*</span></b></div>
                    <CustomSelect
                      value={subPlan} onChange={setSubPlan}
                      options={[
                        { value: 'MONTHLY', label: `Monthly Plan • Rs. ${planPrices.MONTHLY}/mo` },
                        { value: 'HALF_YEARLY', label: `6-Month Plan • Rs. ${planPrices.HALF_YEARLY}/6mo` },
                        { value: 'YEARLY', label: `Yearly Plan • Rs. ${planPrices.YEARLY}/yr` },
                      ]}
                    />
                  </div>
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><Calendar /></div><b>End Date (Validity) <span className="req">*</span></b></div>
                    <input
                      type="date" required value={subEndDate} disabled
                      style={{ width: '100%', background: 'var(--card-2)', opacity: 0.6, border: '1.5px solid var(--border-2)', color: 'var(--text-2)', borderRadius: 13, padding: '13px 15px', fontSize: 14, outline: 'none', cursor: 'not-allowed' }}
                    />
                    <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>Auto-calculated based on selected tier</span>
                  </div>
                </div>
              </div>

              <div className="reg-section">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <div className="reg-field-label" style={{ marginBottom: 6 }}><div className="reg-ico" style={{ background: 'var(--purple)' }}><Camera /></div><b>Shop Photo <span className="req">*</span></b></div>
                    <input
                      type="file" accept="image/*" required
                      onClick={primeStoragePermission}
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const r = new FileReader();
                          r.onloadend = () => compressBase64Image(r.result, setProvisionShopPhoto);
                          r.readAsDataURL(file);
                        }
                      }}
                      className="w-full text-xs cursor-pointer file:mr-2 file:py-1.5 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:uppercase"
                      style={{ color: 'var(--text-3)' }}
                    />
                  </div>
                  <div>
                    <div className="reg-field-label" style={{ marginBottom: 6 }}><div className="reg-ico" style={{ background: 'var(--pink)' }}><FileText /></div><b>Shop License <span className="req">*</span></b></div>
                    <input
                      type="file" accept="image/*,application/pdf" required
                      onClick={primeStoragePermission}
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const r = new FileReader();
                          r.onloadend = () => compressBase64Image(r.result, setProvisionShopLicense);
                          r.readAsDataURL(file);
                        }
                      }}
                      className="w-full text-xs cursor-pointer file:mr-2 file:py-1.5 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:uppercase"
                      style={{ color: 'var(--text-3)' }}
                    />
                  </div>
                  <div>
                    <div className="reg-field-label" style={{ marginBottom: 6 }}><div className="reg-ico" style={{ background: 'var(--blue)' }}><CreditCard /></div><b>Owner Aadhaar <span className="req">*</span></b></div>
                    <input
                      type="file" accept="image/*,application/pdf" required
                      onClick={primeStoragePermission}
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const r = new FileReader();
                          r.onloadend = () => compressBase64Image(r.result, setProvisionOwnerAadhaar);
                          r.readAsDataURL(file);
                        }
                      }}
                      className="w-full text-xs cursor-pointer file:mr-2 file:py-1.5 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:uppercase"
                      style={{ color: 'var(--text-3)' }}
                    />
                  </div>
                </div>
              </div>

              {/* Fixed Footer with CTA buttons */}
              <div className="flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
                <button
                  type="button" onClick={() => setShowAddModal(false)}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  Provision Account
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {showEditModal && selectedShop && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.82)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 640, margin: 'auto', padding: 28 }}>
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><Settings /> Workspace Settings</span>
                <h2 style={{ fontSize: 19 }}>Edit Shop Workspace Details</h2>
              </div>
              <button onClick={() => setShowEditModal(false)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleEditShopSubmit}>
              <div className="reg-section">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Store /></div><b>Workspace Name <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="text" required value={editName} onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="reg-section">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Phone /></div><b>Phone Number <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="tel" required value={editPhone} onChange={(e) => setEditPhone(e.target.value)}
                    />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><MapPin /></div><b>Registered Address (Fixed)</b></div>
                  <div className="input-wrap">
                    <input
                      type="text" readOnly value={editAddress}
                      style={{ opacity: 0.6, cursor: 'not-allowed' }}
                    />
                  </div>
                </div>
              </div>

              <div className="reg-section">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Shop Photo */}
                  <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 10, borderRadius: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <span style={{ fontSize: 9, color: 'var(--purple)', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, textTransform: 'uppercase' }}><Camera style={{ width: 11, height: 11 }} /> Shop Photo</span>
                      {editShopPhoto ? (
                        <div style={{ marginTop: 6, height: 56, width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-2)', background: '#000' }}>
                          <img src={getAssetUrl(editShopPhoto)} className="w-full h-full object-cover" alt="Shop Photo Preview" />
                        </div>
                      ) : (
                        <span style={{ fontSize: 9, color: 'var(--text-3)', fontStyle: 'italic', display: 'block', marginTop: 6 }}>Not Uploaded</span>
                      )}
                    </div>
                    {editShopPhoto && (
                      <button
                        type="button"
                        onClick={() => downloadAsset(editShopPhoto, editShopPhotoName || filenameForAsset(editShopPhoto, 'shop_photo'))}
                        className="btn btn-primary btn-sm btn-block"
                        style={{ fontSize: 9, padding: '6px 10px' }}
                      >
                        Download
                      </button>
                    )}
                  </div>

                  {/* Shop License */}
                  <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 10, borderRadius: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <span style={{ fontSize: 9, color: 'var(--pink)', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, textTransform: 'uppercase' }}><FileText style={{ width: 11, height: 11 }} /> Shop License</span>
                      {editShopLicense ? (
                        <div style={{ marginTop: 6, height: 56, width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-2)', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {(editShopLicense.startsWith('data:application/pdf') || editShopLicense.toLowerCase().endsWith('.pdf')) ? (
                            <FileText style={{ width: 20, height: 20, color: 'var(--red)' }} />
                          ) : (
                            <img src={getAssetUrl(editShopLicense)} className="w-full h-full object-cover" alt="License Preview" />
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: 9, color: 'var(--text-3)', fontStyle: 'italic', display: 'block', marginTop: 6 }}>Not Uploaded</span>
                      )}
                    </div>
                    {editShopLicense && (
                      <button
                        type="button"
                        onClick={() => downloadAsset(editShopLicense, editShopLicenseName || filenameForAsset(editShopLicense, 'shop_license'))}
                        className="btn btn-primary btn-sm btn-block"
                        style={{ fontSize: 9, padding: '6px 10px' }}
                      >
                        Download
                      </button>
                    )}
                  </div>

                  {/* Owner Aadhaar */}
                  <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 10, borderRadius: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <span style={{ fontSize: 9, color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, textTransform: 'uppercase' }}><CreditCard style={{ width: 11, height: 11 }} /> Owner Aadhaar</span>
                      {editOwnerAadhaar ? (
                        <div style={{ marginTop: 6, height: 56, width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-2)', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {(editOwnerAadhaar.startsWith('data:application/pdf') || editOwnerAadhaar.toLowerCase().endsWith('.pdf')) ? (
                            <FileText style={{ width: 20, height: 20, color: 'var(--red)' }} />
                          ) : (
                            <img src={getAssetUrl(editOwnerAadhaar)} className="w-full h-full object-cover" alt="Aadhaar Preview" />
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: 9, color: 'var(--text-3)', fontStyle: 'italic', display: 'block', marginTop: 6 }}>Not Uploaded</span>
                      )}
                    </div>
                    {editOwnerAadhaar && (
                      <button
                        type="button"
                        onClick={() => downloadAsset(editOwnerAadhaar, editOwnerAadhaarName || filenameForAsset(editOwnerAadhaar, 'owner_aadhaar'))}
                        className="btn btn-primary btn-sm btn-block"
                        style={{ fontSize: 9, padding: '6px 10px' }}
                      >
                        Download
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
                <button
                  type="button" onClick={() => setShowEditModal(false)}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Subscription Update Modal */}
      {showSubModal && selectedShop && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.75)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 440, margin: 'auto', padding: 28 }}>
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><DollarSign /> Billing</span>
                <h2 style={{ fontSize: 19 }}>Update Shop Subscription</h2>
              </div>
              <button onClick={() => setShowSubModal(false)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, background: 'var(--card-2)', padding: 12, borderRadius: 13, border: '1px solid var(--border-2)', marginBottom: 18 }}>
              Target shop: <span style={{ fontWeight: 800, color: 'var(--gold)' }}>{selectedShop.name}</span>
            </div>

            <form onSubmit={handleUpdateSubscriptionSubmit}>
              <div className="reg-section">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><DollarSign /></div><b>Plan Tier <span className="req">*</span></b></div>
                  <CustomSelect
                    value={newPlan} onChange={setNewPlan}
                    options={[
                      { value: 'MONTHLY', label: `Monthly Plan • Rs. ${planPrices.MONTHLY}/mo` },
                      { value: 'HALF_YEARLY', label: `6-Month Plan • Rs. ${planPrices.HALF_YEARLY}/6mo` },
                      { value: 'YEARLY', label: `Yearly Plan • Rs. ${planPrices.YEARLY}/yr` },
                    ]}
                  />
                </div>

                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><Calendar /></div><b>New End Date <span className="req">*</span></b></div>
                  <input
                    type="date" required value={newEndDate} disabled
                    style={{ width: '100%', background: 'var(--card-2)', opacity: 0.6, border: '1.5px solid var(--border-2)', color: 'var(--text-2)', borderRadius: 13, padding: '13px 15px', fontSize: 14, outline: 'none', cursor: 'not-allowed' }}
                  />
                  <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>Auto-calculated based on selected tier</span>
                </div>
              </div>

              <div className="flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
                <button
                  type="button" onClick={() => setShowSubModal(false)}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  Update Plan
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {showPaymentProvisionModal && provisionDto && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10 animate-fade-in" style={{ background: 'rgba(5,4,3,0.9)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 560, margin: 'auto', padding: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', padding: 20, background: 'var(--card-2)' }}>
              <div className="flex items-center gap-2">
                <div className="icon-badge green"><ShieldCheck /></div>
                <div>
                  <h2 style={{ fontSize: 14 }}>Plan Subscription Escrow Pay</h2>
                  <p style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600, marginTop: 2 }}>Workspace Terminal Provisioning Payment</p>
                </div>
              </div>
              {!paymentProcessing && !paymentSuccess && (
                <button onClick={() => setShowPaymentProvisionModal(false)} className="icon-btn">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Success State */}
            {paymentSuccess ? (
              <div style={{ padding: 40, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
                <div className="icon-badge green animate-bounce" style={{ width: 64, height: 64, borderRadius: 999 }}>
                  <Check style={{ width: 30, height: 30 }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 18 }}>Payment Authorized!</h3>
                  <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, maxWidth: 320, margin: '8px auto 0' }}>
                    The subscription payment has settled successfully. Workspace <strong style={{ color: 'var(--text-1)' }}>{provisionDto.name}</strong> is now fully provisioned and activated.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowPaymentProvisionModal(false);
                  }}
                  className="btn btn-primary btn-block"
                >
                  Close & Proceed
                </button>
              </div>
            ) : paymentProcessing ? (
              /* Processing State */
              <div style={{ padding: 48, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
                <div className="relative w-12 h-12 flex items-center justify-center">
                  <span className="absolute inset-0 rounded-full" style={{ border: '4px solid var(--gold-dim)' }}></span>
                  <span className="absolute inset-0 rounded-full animate-spin" style={{ border: '4px solid transparent', borderTopColor: 'var(--gold)' }}></span>
                </div>
                <div>
                  <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.05em' }}>Processing Transaction</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, marginTop: 4 }}>Finalizing workspace creation tunnels.</p>
                </div>
                <div style={{ width: '100%', background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 12, borderRadius: 13, fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'monospace', textAlign: 'center', minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: 'var(--gold)' }}>{processingLog}</span>
                </div>
              </div>
            ) : (
              /* Main Checkout Form */
              <form onSubmit={executePaymentProvision} style={{ padding: 24 }}>
                {/* Invoice Summary */}
                <div className="flex justify-between items-center" style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 16, borderRadius: 16, marginBottom: 18 }}>
                  <div>
                    <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', display: 'block', fontWeight: 700 }}>Workspace Provision Invoice</span>
                    <span style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 600 }}>Plan: <span style={{ fontWeight: 800, color: 'var(--gold)' }}>{provisionDto.plan}</span></span>
                  </div>
                  <span style={{ fontSize: 21, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--display)' }}>Rs. {planPrices[provisionDto.plan]}</span>
                </div>

                {/* Tab Selector */}
                <div className="grid grid-cols-2 gap-2" style={{ marginBottom: 18 }}>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`store-tab ${paymentMethod === 'card' ? 'active' : ''}`}
                    style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 8px' }}
                  >
                    <CreditCard className="h-4 w-4" />
                    <span style={{ fontSize: 10 }}>Credit Card</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('upi')}
                    className={`store-tab ${paymentMethod === 'upi' ? 'active' : ''}`}
                    style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 8px' }}
                  >
                    <QrCode className="h-4 w-4" />
                    <span style={{ fontSize: 10 }}>UPI QR Code</span>
                  </button>
                </div>

                {paymentMethod === 'card' ? (
                  <div className="animate-fade-in">
                    <div className="field">
                      <label>Cardholder Full Name</label>
                      <div className="input-wrap">
                        <User />
                        <input
                          type="text" required value={cardHolder} onChange={(e) => setCardHolder(e.target.value)}
                          placeholder="e.g. Ramesh Kumar"
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label>Debit / Credit Card Number</label>
                      <div className="input-wrap">
                        <CreditCard />
                        <input
                          type="text" required value={cardNumber}
                          onChange={(e) => {
                            let val = e.target.value.replace(/\D/g, '').substring(0, 16);
                            const parts = val.match(/.{1,4}/g) || [];
                            setCardNumber(parts.join(' '));
                          }}
                          placeholder="4111 2222 3333 4444"
                          style={{ fontFamily: 'monospace' }}
                        />
                      </div>
                    </div>
                    <div className="form-grid">
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Expiry Date</label>
                        <div className="input-wrap">
                          <Calendar />
                          <input
                            type="text" required value={cardExpiry}
                            onChange={(e) => {
                              let val = e.target.value.replace(/\D/g, '');
                              if (val.length > 2) {
                                setCardExpiry(val.substring(0, 2) + '/' + val.substring(2, 4));
                              } else {
                                setCardExpiry(val);
                              }
                            }}
                            placeholder="MM/YY"
                            style={{ textAlign: 'center' }}
                          />
                        </div>
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>CVV Code</label>
                        <div className="input-wrap">
                          <Lock />
                          <input
                            type="password" required value={cardCvv} onChange={(e) => setCardCvv(e.target.value.substring(0, 3))}
                            placeholder="•••"
                            style={{ textAlign: 'center', fontFamily: 'monospace' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14, padding: '10px 0' }}>
                    <div style={{ background: '#fff', padding: 12, borderRadius: 18, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 160, height: 160 }}>
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://kee.platform/subscribe?amount=${planPrices[provisionDto.plan]}`}
                        alt="Pay QR code"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div>
                      <p style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 700 }}>Scan to Authorize Setup Invoice</p>
                      <p style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600, maxWidth: 260, marginTop: 4 }}>
                        Scan with GPay, PhonePe, Paytm, or BHIM. Subscription activates automatically post-detection.
                      </p>
                    </div>
                  </div>
                )}

                {/* Footer buttons */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
                  <div className="flex items-center gap-1.5 justify-center" style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600, marginBottom: 14 }}>
                    <Lock className="h-3 w-3" style={{ color: 'var(--green)' }} />
                    <span>256-bit Secure Gateway Payment Portal</span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPaymentProvisionModal(false)}
                      className="btn btn-ghost"
                      style={{ flex: 1 }}
                    >
                      Cancel Setup
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ flex: 2 }}
                    >
                      Pay Rs. {planPrices[provisionDto.plan]} & Provision
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ============================================================================
// COMPONENT 3: SUPER CUSTOMER SUPERVISION VIEW (SUPER ADMIN ONLY)
// ============================================================================
function SuperCustomersView({ t, api, searchDispatch }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Picks up a query dispatched from the global header search panel
  // (filter = "Customer"). The nonce lets the same text be re-submitted.
  useEffect(() => {
    if (searchDispatch && searchDispatch.type === 'customer') {
      setSearch(searchDispatch.query);
    }
  }, [searchDispatch?.nonce]);
  const [viewCust, setViewCust] = useState(null);

  // Create Customer (Super Admin) - uses the same multi-step
  // CustomerRegistrationWizard as Shop Admin, rendered full-screen with a
  // required Shop dropdown on Step 1 (see superAdminMode prop).
  const [shops, setShops] = useState([]);
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  useBackHandler(showCreateWizard, () => setShowCreateWizard(false));

  useEffect(() => {
    fetchCustomers();
  }, [search]);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await api.getSuperCustomers(search);
      setCustomers(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openCreateWizard = async () => {
    setShowCreateWizard(true);
    try {
      const res = await api.getShops();
      setShops(res || []);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><ShieldCheck /> Cross-Tenant Compliance</div>
          <h1>Customer Registry</h1>
          <p>Supervise and edit duplicate-key compliance records across every shop workspace on Key Shop.</p>
        </div>
        <button onClick={openCreateWizard} className="btn btn-primary">
          <Plus />
          <span>Create Customer</span>
        </button>
      </div>

      {/* The search box lives outside the loading/results swap below so it
          never unmounts while typing - every keystroke sets `search`, which
          re-triggers the fetch and flips `loading` briefly, but the input
          itself stays mounted throughout and keeps focus the whole time. */}
      <div className="card table-card">
        <div className="table-head">
          <h2 style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 17 }}>
            All Customers <span style={{ color: 'var(--text-3)', fontWeight: 700, fontSize: 13 }}>({customers.length})</span>
          </h2>
          <div className="search-box">
            <Search />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, or key code&hellip;"
            />
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 200 }}>
            <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Loading customer registry&hellip;</span>
          </div>
        ) : customers.length === 0 ? (
          <p style={{ padding: 24, fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>
            No customer records match this search across the platform.
          </p>
        ) : (
        <table className="kee-table">
          <thead>
            <tr>
              <th>Tenant Workspace</th>
              <th>Customer</th>
              <th>Phone</th>
              <th>Key Code</th>
              <th>Registered</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.map(c => (
              <tr key={c.id}>
                <td className="cell-sub" style={{ fontWeight: 700, color: 'var(--text-2)' }}>{c.shop ? c.shop.name : 'Shop Workspace'}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className={`icon-badge ${c.photoUrl ? 'jgreen' : 'rose'}`} style={{ width: 34, height: 34, borderRadius: 10 }}>
                      <User style={{ width: 16, height: 16 }} />
                    </div>
                    <div>
                      <div className="cell-primary">{c.name}</div>
                      <div className="cell-sub">{c.photoUrl ? 'Photo on file' : 'Photo pending'}</div>
                    </div>
                  </div>
                </td>
                <td className="cell-sub" style={{ fontWeight: 700, color: 'var(--text-2)' }}>{c.phone}</td>
                <td>
                  <span className="badge badge-active"><span className="dot" />{c.keyNumber}</span>
                </td>
                <td className="cell-sub" style={{ fontWeight: 700, color: 'var(--text-2)' }}>
                  {new Date(c.createdAt).toLocaleDateString()}
                  <div className="cell-sub">{new Date(c.createdAt).toLocaleTimeString()}</div>
                </td>
                <td>
                  <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                    <button onClick={() => setViewCust(c)} className="icon-btn" title="View compliance file">
                      <Eye />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>

      {/* Create Customer - full-screen overlay hosting the SAME multi-step
          CustomerRegistrationWizard used by Shop Admin, in superAdminMode
          (adds the required Shop dropdown on Step 1). */}
      {showCreateWizard && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'var(--bg-0, #0b0a09)' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px 60px' }}>
            <CustomerRegistrationWizard
              t={t}
              api={api}
              superAdminMode
              shops={shops}
              onCancel={() => setShowCreateWizard(false)}
              onDone={() => {
                setShowCreateWizard(false);
                fetchCustomers();
              }}
            />
          </div>
        </div>,
        document.body
      )}

      {viewCust && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.82)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 620, margin: 'auto', padding: 28, overflowX: 'hidden' }}>
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><FileText /> Compliance File</span>
                <h2 style={{ fontSize: 19 }}>{viewCust.name}</h2>
              </div>
              <button onClick={() => setViewCust(null)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="reg-section">
              <div className="grid grid-cols-2 gap-4">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Phone /></div><b>Phone Contact</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{viewCust.phone}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Calendar /></div><b>Registry Date</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{new Date(viewCust.createdAt).toLocaleString()}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><Home /></div><b>Address</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }} className="block truncate">{viewCust.address}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><KeyRound /></div><b>Key Blank Code</b></div>
                  <span className="badge badge-active"><span className="dot" />{viewCust.keyNumber}</span>
                </div>
              </div>
            </div>

            <div className="reg-section">
              <div className="grid grid-cols-2 gap-4">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Fingerprint /></div><b>ID Verification</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{viewCust.idProofType}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><Lock /></div><b>ID Number (Decrypted)</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gold)' }}>{viewCust.idProofNumber}</span>
                </div>
              </div>

              <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 16, padding: 14, marginTop: 4 }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`icon-badge ${viewCust.latitude ? 'jgreen' : 'rose'}`} style={{ width: 32, height: 32, borderRadius: 10 }}>
                      <MapPin style={{ width: 16, height: 16 }} />
                    </div>
                    <div>
                      <p style={{ fontWeight: 700, color: 'var(--text-0)', fontSize: 13 }}>GPS Coordinates</p>
                      {viewCust.latitude && viewCust.longitude ? (
                        <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, fontWeight: 600 }}>Lat: {viewCust.latitude} &bull; Long: {viewCust.longitude}</p>
                      ) : (
                        <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, fontWeight: 600, fontStyle: 'italic' }}>Not captured</p>
                      )}
                    </div>
                  </div>
                  {viewCust.mapsLink && (
                    <a href={viewCust.mapsLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10.5, color: 'var(--gold)', fontWeight: 800 }} className="flex items-center gap-1 hover:underline">
                      <span>Google Maps</span><ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                {viewCust.capturedAddress && (
                  <div style={{ fontSize: 10.5, color: 'var(--text-2)', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8, paddingLeft: 42, fontWeight: 600 }}>
                    <span style={{ display: 'block', fontWeight: 800, fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase' }}>Captured Address</span>
                    <span>{viewCust.capturedAddress}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="reg-section" style={{ marginBottom: 0 }}>
              <div className="reg-field">
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Camera /></div><b>Webcam Photo</b></div>
                {viewCust.photoUrl ? (
                  <div style={{ width: '100%', height: 128, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-2)' }}>
                    <img src={getAssetUrl(viewCust.photoUrl)} alt="Customer snapshot" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div style={{ width: '100%', height: 128, borderRadius: 12, border: '1.5px dashed var(--border-2)' }} className="flex items-center justify-center">
                    <Camera style={{ width: 18, height: 18, color: 'var(--text-3)' }} />
                  </div>
                )}
              </div>

              {viewCust.documents && viewCust.documents.length > 0 && (
                <div className="reg-field space-y-2" style={{ minWidth: 0 }}>
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><FileCheck /></div><b>Attached ID Copies</b></div>
                  {viewCust.documents.map((d, di) => {
                    const docColors = ['purple', 'pink', 'blue', 'orange', 'teal', 'skyblue', 'rose', 'jgreen'];
                    const docColor = docColors[di % docColors.length];
                    const uploaded = !!(d.fileUrl || d.fileKey);
                    return (
                      <div key={d.id} style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 10, borderRadius: 12, minWidth: 0 }} className="flex items-center gap-2 text-xs">
                        <div className={`icon-badge ${docColor}`} style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0 }}>
                          <FileText style={{ width: 13, height: 13 }} />
                        </div>
                        <span style={{ color: 'var(--text-1)', fontWeight: 600, flex: '1 1 auto', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d.documentType}>{d.documentType}</span>
                        <span
                          className={`badge ${uploaded ? 'badge-active' : 'badge-suspended'}`}
                          style={{ flexShrink: 0, fontSize: 9.5 }}
                        >
                          {uploaded ? 'Uploaded' : 'Missing'}
                        </span>
                        <button
                          type="button"
                          title="Download"
                          aria-label="Download"
                          disabled={!uploaded}
                          onClick={() => downloadAsset(d.fileUrl, d.originalName || d.fileKey || 'document')}
                          className="icon-btn"
                          style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, opacity: uploaded ? 1 : 0.4, cursor: uploaded ? 'pointer' : 'not-allowed' }}
                        >
                          <Download style={{ width: 13, height: 13 }} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
              <button onClick={() => setViewCust(null)} className="btn btn-ghost">Close File</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ============================================================================
// COMPONENT 4: MASTER KEY DATABASE CRUD (SUPER ADMIN ONLY)
// ============================================================================
function KeysCatalogView({ api, searchDispatch }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  useBackHandler(showAddModal, () => setShowAddModal(false));
  const [editKey, setEditKey] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Picks up a query dispatched from the global header search panel (filter = "Key").
  useEffect(() => {
    if (searchDispatch && searchDispatch.type === 'key') {
      setSearchQuery(searchDispatch.query);
    }
  }, [searchDispatch?.nonce]);

  // Form states
  const [keyNumber, setKeyNumber] = useState('');
  const [category, setCategory] = useState('');
  const [backImageUrl, setBackImageUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await api.getMasterKeys();
      setKeys(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const dto = { keyNumber, category, backImageUrl };

      if (editKey) {
        await api.updateMasterKey(editKey.id, dto);
      } else {
        await api.createMasterKey(dto);
      }
      setShowAddModal(false);
      resetForm();
      fetchKeys();
    } catch (err) {
      setErrorMsg(err.message || 'Operation failed');
    }
  };

  const handleEditClick = (k) => {
    setEditKey(k);
    setKeyNumber(k.keyNumber);
    setCategory(k.category);
    setBackImageUrl(k.backImageUrl || '');
    setShowAddModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to remove this key blank from the central catalogue?')) return;
    try {
      await api.deleteMasterKey(id);
      fetchKeys();
    } catch (e) {
      alert(e.message);
    }
  };

  const resetForm = () => {
    setEditKey(null);
    setKeyNumber('');
    setCategory('');
    setBackImageUrl('');
    setErrorMsg('');
  };

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Key /> Platform Catalogue</div>
          <h1>Master Key Catalogue</h1>
          <p>Provision key blank specifications available for lookup across every shop terminal.</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowAddModal(true); }}
          className="btn btn-primary"
        >
          <Plus />
          <span>Add Key Blank</span>
        </button>
      </div>

      {/* Central catalog lookup search input */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', padding: 0, marginBottom: 24 }}>
        <div className="search-box" style={{ width: '100%', minWidth: 0, border: 'none', background: 'transparent', padding: '18px 22px' }}>
          <Search />
          <input
            type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search catalogue by code, category, specs reference&hellip;"
            style={{ fontSize: 14 }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="icon-btn" style={{ width: 26, height: 26 }}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
          <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Loading catalogue&hellip;</span>
        </div>
      ) : (() => {
        const filteredKeys = keys.filter(k =>
          (k.keyNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (k.category || '').toLowerCase().includes(searchQuery.toLowerCase())
        );

        if (filteredKeys.length === 0) {
          return (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 220 }}>
              <div className="icon-badge maroon"><KeyRound /></div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>No key blanks match this search</span>
            </div>
          );
        }

        const catalogAccents = ['var(--purple)', 'var(--pink)', 'var(--blue)', 'var(--orange)', 'var(--teal)', 'var(--skyblue)', 'var(--rose)', 'var(--jgreen)'];

        return (
          <div className="product-grid stagger-in">
            {filteredKeys.map((k, idx) => (
              <div key={k.id} className="product-card">
                <div className="product-img" style={{ background: catalogAccents[idx % catalogAccents.length] }}>
                  <KeyRound style={{ color: '#ffffff' }} />
                  <span className="product-tag">{k.category}</span>
                </div>
                <div className="product-body">
                  <div className="flex items-center justify-between">
                    <span className="pname">{k.keyNumber}</span>
                  </div>
                  <p className="pcat">{k.category}</p>
                  <div className="product-foot" style={{ marginTop: 8, gap: 8 }}>
                    <button
                      onClick={() => handleEditClick(k)}
                      className="btn btn-ghost btn-sm"
                      style={{ flex: 1 }}
                    >
                      <Edit className="h-3.5 w-3.5" />
                      <span>Modify</span>
                    </button>
                    <button
                      onClick={() => handleDelete(k.id)}
                      className="btn btn-danger-outline btn-sm"
                      style={{ flex: 1 }}
                    >
                      <Trash className="h-3.5 w-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Add / Edit Key Modal */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.85)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 640, margin: 'auto', padding: 28 }}>
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><Key /> Catalogue Entry</span>
                <h2 style={{ fontSize: 19 }}>{editKey ? 'Modify Key Blank' : 'Add New Key Blank'}</h2>
              </div>
              <button onClick={() => setShowAddModal(false)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            {errorMsg && (
              <div style={{ display: 'flex', gap: 8, background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.35)', padding: 10, borderRadius: 12, fontSize: 12, color: '#b91c1c', fontWeight: 600, marginBottom: 16 }}>
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {editKey && (
              <div className="reg-section">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Hash /></div><b>Key Number / Code</b></div>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-0)', wordBreak: 'break-word' }}>{editKey.keyNumber}</span>
                  </div>
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><Store /></div><b>Connected Shop</b></div>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-0)', wordBreak: 'break-word' }}>{editKey.shop ? editKey.shop.name : 'Global Catalogue'}</span>
                  </div>
                </div>

                <div className="reg-field" style={{ marginTop: 13 }}>
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><User /></div><b>Connected Customer{editKey.customers && editKey.customers.length !== 1 ? 's' : ''}</b></div>
                  {editKey.customers && editKey.customers.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {editKey.customers.map(c => (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-0)' }}>{c.name}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>{c.phone}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)', fontStyle: 'italic' }}>No customer linked yet</span>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="reg-section">
                <div className="form-grid">
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Hash /></div><b>Key Code <span className="req">*</span></b></div>
                    <div className="input-wrap">
                      <input
                        type="text" required value={keyNumber} onChange={(e) => setKeyNumber(e.target.value)}
                        placeholder="e.g. CY-102"
                      />
                    </div>
                  </div>
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Layers /></div><b>Category Type <span className="req">*</span></b></div>
                    <div className="input-wrap">
                      <input
                        type="text" required value={category} onChange={(e) => setCategory(e.target.value)}
                        placeholder="e.g. Padlock"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="reg-section">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Camera /></div><b>Back Image URL</b></div>
                  <div className="input-wrap">
                    <input
                      type="text" value={backImageUrl} onChange={(e) => setBackImageUrl(e.target.value)}
                      placeholder="https://images..."
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 4 }}>
                <button
                  type="button" onClick={() => setShowAddModal(false)}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  {editKey ? 'Save Changes' : 'Publish Key'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ============================================================================
// COMPONENT 6: ADVERTISEMENTS CRUD (SUPER ADMIN ONLY)
// ============================================================================
function AdsManagementView({ api }) {
  const [ads, setAds] = useState([]);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  useBackHandler(showAddModal, () => setShowAddModal(false));
  const [editingAdId, setEditingAdId] = useState(null);

  // Form states
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [type, setType] = useState('BANNER');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [priority, setPriority] = useState(0);
  const [targetAll, setTargetAll] = useState(true);
  const [targetShops, setTargetShops] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchAds();
    fetchShops();
  }, []);

  const fetchAds = async () => {
    setLoading(true);
    try {
      const res = await api.getAdvertisements();
      setAds(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchShops = async () => {
    try {
      const res = await api.getShops();
      setShops(res);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const dto = {
        title, imageUrl, type,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        priority: Number(priority),
        targetAll,
        targetShops
      };
      if (editingAdId) {
        await api.updateAdvertisement(editingAdId, dto);
      } else {
        await api.createAdvertisement(dto);
      }
      setShowAddModal(false);
      resetForm();
      fetchAds();
    } catch (err) {
      setErrorMsg(err.message || (editingAdId ? 'Failed to update campaign' : 'Failed to schedule campaign'));
    }
  };

  const resetForm = () => {
    setEditingAdId(null);
    setTitle('');
    setImageUrl('');
    setType('BANNER');
    setStartDate('');
    setEndDate('');
    setPriority(0);
    setTargetAll(true);
    setTargetShops([]);
    setErrorMsg('');
  };

  const handleEditClick = (ad) => {
    setEditingAdId(ad.id);
    setTitle(ad.title);
    setImageUrl(ad.imageUrl);
    setType(ad.type);
    setStartDate(new Date(ad.startDate).toISOString().slice(0, 10));
    setEndDate(new Date(ad.endDate).toISOString().slice(0, 10));
    setPriority(ad.priority ?? 0);
    setTargetAll(ad.targetAll);
    setTargetShops(ad.targetShops || []);
    setErrorMsg('');
    setShowAddModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to terminate this advertisement campaign?')) return;
    try {
      await api.deleteAdvertisement(id);
      fetchAds();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleShopSelectChange = (shopId) => {
    if (targetShops.includes(shopId)) {
      setTargetShops(targetShops.filter(id => id !== shopId));
    } else {
      setTargetShops([...targetShops, shopId]);
    }
  };

  const adTypeMeta = (type) => {
    if (type === 'POPUP') return { label: 'Interactive Popup', icon: Sparkles };
    if (type === 'NOTICE') return { label: 'Text Notice', icon: Bell };
    return { label: 'Main Banner', icon: Radio };
  };

  const isLive = (ad) => {
    const now = Date.now();
    return new Date(ad.startDate).getTime() <= now && new Date(ad.endDate).getTime() >= now;
  };

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Megaphone /> Growth &amp; Marketing</div>
          <h1>Advertisement Campaigns</h1>
          <p>Publish banners and popups targeted to shop dashboard screens.</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowAddModal(true); }}
          className="btn btn-primary"
        >
          <Plus />
          <span>New Ad Campaign</span>
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
          <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Loading campaigns&hellip;</span>
        </div>
      ) : ads.length === 0 ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 220 }}>
          <div className="icon-badge"><Megaphone /></div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>No ad campaigns scheduled yet.</span>
        </div>
      ) : (
        <div className="product-grid stagger-in">
          {ads.map(ad => {
            const meta = adTypeMeta(ad.type);
            const Icon = meta.icon;
            const live = isLive(ad);
            return (
              <div key={ad.id} className="product-card">
                <div className="product-img" style={{ height: 160 }}>
                  {ad.imageUrl ? (
                    <img src={cleanGoogleImageUrl(ad.imageUrl)} alt={ad.title} className="w-full h-full object-cover" style={{ opacity: 0.9 }} />
                  ) : (
                    <Icon />
                  )}
                  <span className="product-tag"><Icon className="h-3 w-3" style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />{meta.label}</span>
                  <span className={`badge ${live ? 'badge-active' : 'badge-suspended'}`} style={{ position: 'absolute', top: 10, right: 10 }}>
                    <span className="dot" />{live ? 'Live' : 'Scheduled'}
                  </span>
                </div>
                <div className="product-body">
                  <div className="flex items-center justify-between">
                    <span className="pname">{ad.title}</span>
                    <span className="badge badge-gold">Priority {ad.priority}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11, color: 'var(--text-2)', background: 'var(--card-2)', border: '1px solid var(--border)', padding: 10, borderRadius: 12, fontWeight: 600 }}>
                    <div>
                      <span style={{ color: 'var(--text-3)', display: 'block', fontWeight: 800, textTransform: 'uppercase', fontSize: 9.5, letterSpacing: '.04em' }}>Start</span>
                      {new Date(ad.startDate).toLocaleDateString()}
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-3)', display: 'block', fontWeight: 800, textTransform: 'uppercase', fontSize: 9.5, letterSpacing: '.04em' }}>End</span>
                      {new Date(ad.endDate).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="cell-sub" style={{ fontSize: 11.5 }}>
                    <Users className="h-3 w-3" style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} />
                    {ad.targetAll ? 'All Key Shops' : `${ad.targetShops.length} targeted shop${ad.targetShops.length === 1 ? '' : 's'}`}
                  </div>

                  <div className="flex gap-2" style={{ marginTop: 4 }}>
                    <button
                      onClick={() => handleEditClick(ad)}
                      className="btn btn-ghost btn-sm btn-block"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => handleDelete(ad.id)}
                      className="btn btn-danger-outline btn-sm btn-block"
                    >
                      <Trash className="h-3.5 w-3.5" />
                      <span>Cancel Campaign</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Campaign Add Modal */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.85)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 640, margin: 'auto', padding: 28 }}>
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><Radio /> Ad Campaign</span>
                <h2 style={{ fontSize: 19 }}>{editingAdId ? 'Edit Ad Campaign' : 'New Visual Ad Campaign'}</h2>
              </div>
              <button onClick={() => setShowAddModal(false)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            {errorMsg && (
              <div style={{ display: 'flex', gap: 8, background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.35)', padding: 10, borderRadius: 12, fontSize: 12, color: '#b91c1c', fontWeight: 600, marginBottom: 16 }}>
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="field">
                <label>Ad Title / Announcement</label>
                <div className="input-wrap">
                  <Megaphone />
                  <input
                    type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. 20% Off Godrej key duplicates this Friday"
                  />
                </div>
              </div>

              <div className="field">
                <label>Banner Image Source</label>
                <div className="flex gap-2">
                  <div className="input-wrap" style={{ flex: 1 }}>
                    <ImageIcon />
                    <input
                      type="text" required value={imageUrl}
                      onChange={(e) => setImageUrl(cleanGoogleImageUrl(e.target.value))}
                      placeholder="Paste Image URL (or Google Image Link)"
                    />
                  </div>
                  <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', flexShrink: 0 }}>
                    <Upload className="h-3.5 w-3.5" />
                    <span>Upload</span>
                    <input
                      type="file" accept="image/*" className="hidden"
                      onClick={primeStoragePermission}
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setImageUrl(reader.result);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                </div>
                {imageUrl && (
                  <div style={{ marginTop: 10, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', height: 110, background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src={cleanGoogleImageUrl(imageUrl)} alt="Preview" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                  </div>
                )}
              </div>

              <div className="form-grid">
                <div className="field">
                  <label>Ad Format</label>
                  <CustomSelect
                    value={type} onChange={setType}
                    options={[
                      { value: 'BANNER', label: 'Main Banner Notice' },
                      { value: 'POPUP', label: 'Interactive Login Popup' },
                      { value: 'NOTICE', label: 'Dashboard Text Notice' },
                    ]}
                  />
                </div>
                <div className="field">
                  <label>Campaign Priority</label>
                  <div className="input-wrap">
                    <Sliders />
                    <input
                      type="number" required value={priority} onChange={(e) => setPriority(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              <div className="form-grid" style={{ borderTop: '1px solid var(--border)', paddingTop: 18 }}>
                <div className="field">
                  <label>Start Date</label>
                  <div className="input-wrap">
                    <Calendar />
                    <input
                      type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="field">
                  <label>End Date</label>
                  <div className="input-wrap">
                    <CalendarRange />
                    <input
                      type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 4 }}>
                <label className="eyebrow" style={{ marginBottom: 10 }}><Users /> Target Audience</label>
                <div className="flex gap-4 items-center" style={{ marginBottom: 10 }}>
                  <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 700 }}>
                    <input
                      type="radio" name="target" checked={targetAll} onChange={() => setTargetAll(true)}
                      style={{ accentColor: 'var(--gold)', width: 15, height: 15 }}
                    />
                    <span>Broadcast to all key shops</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 700 }}>
                    <input
                      type="radio" name="target" checked={!targetAll} onChange={() => setTargetAll(false)}
                      style={{ accentColor: 'var(--gold)', width: 15, height: 15 }}
                    />
                    <span>Target specific shops</span>
                  </label>
                </div>

                {!targetAll && (
                  <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 13, padding: 12, maxHeight: 140, overflowY: 'auto' }}>
                    {shops.map(s => (
                      <label key={s.id} className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 600, padding: '5px 4px' }}>
                        <input
                          type="checkbox" checked={targetShops.includes(s.id)} onChange={() => handleShopSelectChange(s.id)}
                          style={{ accentColor: 'var(--gold)', width: 14, height: 14 }}
                        />
                        <span>{s.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
                <button
                  type="button" onClick={() => setShowAddModal(false)}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  {editingAdId ? 'Save Changes' : 'Schedule Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ============================================================================
// COMPONENT 6B: CROSS-SHOP PROMOTIONS (ads, promotional products & offers, shared feed)
// Every shop (and the Super Admin) sees every shop's listings. A Shop Admin can
// create/edit/delete PRODUCT, AD and OFFER listings for their own shop only;
// an OFFER may optionally be linked to one of that shop's existing listings.
// The Super Admin cannot publish listings, but can moderate (edit/delete) any
// listing platform-wide, plus gets dedicated Banner Management and Offer
// Management sub-tabs alongside the plain marketplace feed.
// ============================================================================
// OLX-style inventory categories. Freeform on the backend (productType is a
// plain string, not an enum) so this list can grow without a migration - the
// options themselves are Super-Admin-managed (see ProductType model /
// api.getProductTypes) rather than hardcoded here. This is now the ONLY type
// classification a listing has - the old separate "Listing Type" (Inventory
// Product / Advertisement / Offer/Discount) picker has been removed from the
// create/edit form; every new listing is created as a plain PRODUCT and
// categorized purely via this list.

function PromotionsView({ api, user, searchDispatch }) {
  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const [subTab, setSubTab] = useState('feed'); // feed | banners | offers (banners/offers = Super Admin only)

  // A query dispatched from the global header search panel always targets
  // the plain Inventory Feed, never the Banner/Offer moderation sub-tabs.
  useEffect(() => {
    if (searchDispatch) setSubTab('feed');
  }, [searchDispatch?.nonce]);

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Package /> Cross-Shop Marketplace</div>
          <h1>Inventory</h1>
          <p>
            {isSuperAdmin
              ? 'Manage the shared inventory feed, banner ad campaigns and shop offers across the platform.'
              : 'Browse and list products shared across every shop on the platform'}
          </p>
        </div>
      </div>

      {isSuperAdmin && (
        <div className="store-tabs">
          <button
            type="button"
            className={`store-tab ${subTab === 'feed' ? 'active' : ''}`}
            onClick={() => setSubTab('feed')}
          >
            <Layers className="h-3.5 w-3.5" style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
            Inventory Feed
          </button>
          <button
            type="button"
            className={`store-tab ${subTab === 'banners' ? 'active' : ''}`}
            onClick={() => setSubTab('banners')}
          >
            <Megaphone className="h-3.5 w-3.5" style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
            Banner Management
          </button>
          <button
            type="button"
            className={`store-tab ${subTab === 'offers' ? 'active' : ''}`}
            onClick={() => setSubTab('offers')}
          >
            <BadgePercent className="h-3.5 w-3.5" style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
            Offer Management
          </button>
        </div>
      )}

      {subTab === 'banners' && isSuperAdmin ? (
        <AdsManagementView api={api} />
      ) : (
        <PromotionsFeed key={subTab} api={api} user={user} isSuperAdmin={isSuperAdmin} onlyOffers={subTab === 'offers'} searchDispatch={subTab === 'feed' ? searchDispatch : null} />
      )}
    </div>
  );
}

function PromotionsFeed({ api, user, isSuperAdmin, onlyOffers, searchDispatch }) {
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  useBackHandler(showAddModal, () => setShowAddModal(false));
  const [editingId, setEditingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Form state
  const [type, setType] = useState('PRODUCT');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [price, setPrice] = useState('');
  const [productType, setProductType] = useState('');
  const [phone, setPhone] = useState('');
  const [discountPercentage, setDiscountPercentage] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [linkedPromotionId, setLinkedPromotionId] = useState('');

  // Super-Admin-managed list of product types (see ProductType model /
  // api.getProductTypes) that powers the Product Type dropdown below -
  // replaces what used to be a hardcoded PRODUCT_TYPES array.
  const [productTypes, setProductTypes] = useState([]);

  // OLX-style category filter chip, applied client-side over the fetched feed.
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Free-text query, either typed locally or dispatched from the global
  // header search panel (filter = "Product Type" / "Location" / "Anything").
  const [textQuery, setTextQuery] = useState('');

  useEffect(() => {
    fetchPromotions();
    api.getProductTypes()
      .then((res) => {
        setProductTypes(res || []);
        setProductType((prev) => prev || res?.[0]?.name || '');
      })
      .catch((e) => console.error('Failed to load product types:', e));
  }, []);

  useEffect(() => {
    if (searchDispatch && ['productType', 'location', 'all'].includes(searchDispatch.type)) {
      setTextQuery(searchDispatch.query);
      if (searchDispatch.type === 'productType') {
        // If the query exactly matches a known category, jump straight to that chip.
        const match = productTypes.find(pt => pt.name.toLowerCase() === searchDispatch.query.trim().toLowerCase());
        if (match) setCategoryFilter(match.name);
      }
    }
  }, [searchDispatch?.nonce]);

  const fetchPromotions = async () => {
    setLoading(true);
    try {
      // Offer Management (Super Admin) needs every offer regardless of expiry
      // for moderation; the plain marketplace feed only shows active offers.
      const res = await api.getPromotions(onlyOffers);
      setPromotions(onlyOffers ? res.filter(p => p.type === 'OFFER') : res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setType('PRODUCT');
    setTitle('');
    setDescription('');
    setImageUrl('');
    setPrice('');
    setProductType(productTypes[0]?.name || '');
    setPhone('');
    setDiscountPercentage('');
    setValidUntil('');
    setLinkedPromotionId('');
    setErrorMsg('');
  };

  const canManage = (promo) => isSuperAdmin || promo.shopId === user.shopId;

  const handleEditClick = (promo) => {
    setEditingId(promo.id);
    setType(promo.type);
    setTitle(promo.title);
    setDescription(promo.description || '');
    setImageUrl(promo.imageUrl || '');
    setPrice(promo.price ?? '');
    setProductType(promo.productType || productTypes[0]?.name || '');
    setPhone(promo.phone || '');
    setDiscountPercentage(promo.discountPercentage ?? '');
    setValidUntil(promo.validUntil ? promo.validUntil.slice(0, 10) : '');
    setLinkedPromotionId(promo.linkedPromotionId || '');
    setErrorMsg('');
    setShowAddModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const dto = {
        // The Listing Type picker (Inventory Product / Advertisement /
        // Offer-Discount) has been removed from the UI - every new listing
        // is always a plain PRODUCT. `type` is only ever something other
        // than 'PRODUCT' here when editing a pre-existing legacy AD/OFFER
        // listing (handleEditClick loads its original type), so this line
        // preserves that legacy record's type instead of silently
        // converting it.
        type,
        title,
        description: description || undefined,
        imageUrl: imageUrl || undefined,
        price: price === '' ? undefined : Number(price),
        productType: productType || undefined,
        phone: phone || undefined,
        discountPercentage: type === 'OFFER' && discountPercentage !== '' ? Number(discountPercentage) : undefined,
        validUntil: type === 'OFFER' && validUntil ? new Date(validUntil).toISOString() : undefined,
        linkedPromotionId: type === 'OFFER' && linkedPromotionId ? linkedPromotionId : undefined,
      };
      if (editingId) {
        await api.updatePromotion(editingId, dto);
      } else {
        await api.createPromotion(dto);
      }
      setShowAddModal(false);
      resetForm();
      fetchPromotions();
    } catch (err) {
      setErrorMsg(err.message || (editingId ? 'Failed to update listing' : 'Failed to publish listing'));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to remove this listing?')) return;
    try {
      await api.deletePromotion(id);
      fetchPromotions();
    } catch (e) {
      alert(e.message);
    }
  };

  const typeMeta = (t) => t === 'AD'
    ? { label: 'Advertisement', icon: Megaphone, color: 'purple' }
    : t === 'OFFER'
      ? { label: 'Offer', icon: BadgePercent, color: 'rose' }
      : { label: 'Promotional Product', icon: Package, color: 'teal' };

  const isExpiredOffer = (promo) => promo.type === 'OFFER' && promo.validUntil && new Date(promo.validUntil) < new Date();

  // A shop may only link an OFFER to one of that same shop's own PRODUCT/AD listings.
  const editingPromo = promotions.find(p => p.id === editingId);
  const linkShopId = editingId ? editingPromo?.shopId : user.shopId;
  const linkableListings = promotions.filter(p => p.shopId === linkShopId && p.type !== 'OFFER' && p.id !== editingId);

  // OLX-style category chips: only meaningful on the default mixed feed (not
  // the Offer Management moderation screen), and only shown once there's
  // more than one distinct productType actually present in the feed.
  const availableCategories = !onlyOffers
    ? Array.from(new Set(promotions.map(p => p.productType).filter(Boolean)))
    : [];
  const byCategory = categoryFilter === 'ALL'
    ? promotions
    : promotions.filter(p => p.productType === categoryFilter);
  const q = textQuery.trim().toLowerCase();
  const visiblePromotions = !q ? byCategory : byCategory.filter(p =>
    (p.title || '').toLowerCase().includes(q) ||
    (p.description || '').toLowerCase().includes(q) ||
    (p.productType || '').toLowerCase().includes(q) ||
    (p.shop?.name || '').toLowerCase().includes(q) ||
    (p.createdBy?.name || '').toLowerCase().includes(q)
  );

  return (
    <div>
      <div className="flex justify-between items-center" style={{ marginTop: 4, marginBottom: 18, gap: 10, flexWrap: 'wrap' }}>
        <div className="input-wrap" style={{ flex: 1, minWidth: 220, margin: 0 }}>
          <Search />
          <input
            type="text" value={textQuery} onChange={(e) => setTextQuery(e.target.value)}
            placeholder="Search inventory by name, product type, shop or seller…"
          />
        </div>
        {!isSuperAdmin && (
          <button
            onClick={() => { resetForm(); setShowAddModal(true); }}
            className="btn btn-primary"
            style={{ flexShrink: 0 }}
          >
            <Plus />
            <span>New Listing</span>
          </button>
        )}
      </div>

      {availableCategories.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`badge ${categoryFilter === 'ALL' ? 'badge-gold' : ''}`}
            style={categoryFilter === 'ALL' ? undefined : { background: 'var(--card-2)', border: '1px solid var(--border-2)', color: 'var(--text-2)', cursor: 'pointer' }}
          >
            All Categories
          </button>
          {availableCategories.map(cat => (
            <button
              type="button"
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`badge ${categoryFilter === cat ? 'badge-gold' : ''}`}
              style={categoryFilter === cat ? undefined : { background: 'var(--card-2)', border: '1px solid var(--border-2)', color: 'var(--text-2)', cursor: 'pointer' }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
          <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Loading listings&hellip;</span>
        </div>
      ) : visiblePromotions.length === 0 ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 220 }}>
          <div className="icon-badge teal"><Package /></div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{onlyOffers ? 'No offers published yet.' : 'No inventory listed yet.'}</span>
        </div>
      ) : (
        <div className="product-grid stagger-in">
          {visiblePromotions.map(promo => {
            const meta = typeMeta(promo.type);
            const Icon = meta.icon;
            const expired = isExpiredOffer(promo);
            return (
              <div key={promo.id} className="product-card">
                <div className="product-img" style={{ height: 150, aspectRatio: '1 / 1', maxHeight: 190 }}>
                  {promo.imageUrl ? (
                    <img src={cleanGoogleImageUrl(promo.imageUrl)} alt={promo.title} className="w-full h-full object-cover" style={{ opacity: 0.9 }} />
                  ) : (
                    <div className={`icon-badge ${meta.color}`}><Icon /></div>
                  )}
                  <span className="product-tag">
                    {promo.type === 'PRODUCT' && promo.productType ? (
                      <><Tag className="h-3 w-3" style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />{promo.productType}</>
                    ) : (
                      <><Icon className="h-3 w-3" style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />{meta.label}</>
                    )}
                  </span>
                  {expired && (
                    <span className="badge badge-suspended" style={{ position: 'absolute', top: 10, right: 10 }}>Expired</span>
                  )}
                </div>
                <div className="product-body">
                  <div className="flex items-center justify-between" style={{ gap: 8 }}>
                    <span className="pname" style={{ minWidth: 0, flex: 1, wordBreak: 'break-word' }}>{promo.title}</span>
                    {promo.price != null && (
                      <span className="badge badge-gold" style={{ flexShrink: 0 }}>
                        <IndianRupee className="h-3 w-3" style={{ display: 'inline', verticalAlign: '-1px' }} />
                        {Number(promo.price).toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>

                  {promo.description && (
                    <p className="cell-sub" style={{ fontSize: 11.5, minHeight: 32, wordBreak: 'break-word' }}>{promo.description}</p>
                  )}

                  {promo.type === 'OFFER' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {promo.discountPercentage != null && (
                        <span className="badge badge-active">
                          <Percent className="h-3 w-3" style={{ display: 'inline', verticalAlign: '-1px' }} />
                          {promo.discountPercentage}% off
                        </span>
                      )}
                      {promo.validUntil && (
                        <span className="badge" style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                          <Clock className="h-3 w-3" style={{ display: 'inline', verticalAlign: '-1px' }} />
                          Valid till {new Date(promo.validUntil).toLocaleDateString()}
                        </span>
                      )}
                      {promo.linkedPromotion && (
                        <span className="badge" style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                          Linked: {promo.linkedPromotion.title}
                        </span>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11, color: 'var(--text-2)', background: 'var(--card-2)', border: '1px solid var(--border)', padding: 10, borderRadius: 12, fontWeight: 600 }}>
                    <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={promo.shop?.name || ''}>
                      <span style={{ color: 'var(--text-3)', display: 'block', fontWeight: 800, textTransform: 'uppercase', fontSize: 9.5, letterSpacing: '.04em' }}>Shop</span>
                      {promo.shop?.name || '—'}
                    </div>
                    <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={promo.createdBy?.name || ''}>
                      <span style={{ color: 'var(--text-3)', display: 'block', fontWeight: 800, textTransform: 'uppercase', fontSize: 9.5, letterSpacing: '.04em' }}>Posted by</span>
                      {promo.createdBy?.name || '—'}
                    </div>
                  </div>

                  {promo.phone && (
                    // Plain tel: link - opens the system dialer automatically inside
                    // the native Android app (Capacitor's default WebViewClient
                    // launches an external ACTION_VIEW intent for non-http schemes),
                    // and falls back to the browser's normal tel: handling on web.
                    <a href={`tel:${promo.phone}`} className="btn btn-primary btn-sm btn-block">
                      <Phone className="h-3.5 w-3.5" />
                      <span>Call: {promo.phone}</span>
                    </a>
                  )}

                  <div className="cell-sub" style={{ fontSize: 11.5 }}>
                    <Calendar className="h-3 w-3" style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} />
                    {new Date(promo.createdAt).toLocaleDateString()}
                  </div>

                  {canManage(promo) && (
                    <div className="flex gap-2" style={{ marginTop: 4 }}>
                      <button
                        onClick={() => handleEditClick(promo)}
                        className="btn btn-ghost btn-sm btn-block"
                      >
                        <Edit className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => handleDelete(promo.id)}
                        className="btn btn-danger-outline btn-sm btn-block"
                      >
                        <Trash className="h-3.5 w-3.5" />
                        <span>Remove</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Listing Modal */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.85)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 640, margin: 'auto', padding: 28 }}>
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><Package /> Inventory Listing</span>
                <h2 style={{ fontSize: 19 }}>{editingId ? 'Edit Listing' : 'New Inventory Listing'}</h2>
              </div>
              <button onClick={() => setShowAddModal(false)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            {errorMsg && (
              <div style={{ display: 'flex', gap: 8, background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.35)', padding: 10, borderRadius: 12, fontSize: 12, color: '#b91c1c', fontWeight: 600, marginBottom: 16 }}>
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="reg-section">

                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Tag /></div><b>Name <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Premium Godrej Key Blanks - Bulk Pack"
                    />
                  </div>
                </div>

                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><Layers /></div><b>Product Type</b></div>
                  <CustomSelect
                    value={productType} onChange={setProductType}
                    placeholder="Select product type"
                    emptyLabel="No product types available yet"
                    options={productTypes.map(pt => ({ value: pt.name, label: pt.name }))}
                  />
                </div>

                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><FileText /></div><b>Description (optional)</b></div>
                  <div className="input-wrap">
                    <input
                      type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                      placeholder="Short description shown on the listing card"
                    />
                  </div>
                </div>
              </div>

              <div className="reg-section">

                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><ImageIcon /></div><b>{type === 'PRODUCT' ? 'Product Photo (optional)' : 'Image / Media (optional)'}</b></div>
                  <div className="flex gap-2">
                    <div className="input-wrap" style={{ flex: 1 }}>
                      <input
                        type="text" value={imageUrl}
                        onChange={(e) => setImageUrl(cleanGoogleImageUrl(e.target.value))}
                        placeholder="Paste Image URL (or Google Image Link)"
                      />
                    </div>
                    <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', flexShrink: 0 }}>
                      <Upload className="h-3.5 w-3.5" />
                      <span>Upload</span>
                      <input
                        type="file" accept="image/*" className="hidden"
                        onClick={primeStoragePermission}
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setImageUrl(reader.result);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                  {imageUrl && (
                    <div style={{ marginTop: 10, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', height: 110, background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={cleanGoogleImageUrl(imageUrl)} alt="Preview" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                    </div>
                  )}
                </div>

                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><IndianRupee /></div><b>Price (optional)</b></div>
                  <div className="input-wrap">
                    <input
                      type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)}
                      placeholder="Leave blank if not applicable"
                    />
                  </div>
                </div>

                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Phone /></div><b>Phone Number <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                    />
                  </div>
                  <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>Shown on the listing card as a tap-to-call button for buyers.</span>
                </div>
              </div>

              {type === 'OFFER' && (
                <div className="reg-section">

                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><Percent /></div><b>Discount Percentage (optional)</b></div>
                    <div className="input-wrap">
                      <input
                        type="number" min="0" max="100" step="1" value={discountPercentage}
                        onChange={(e) => setDiscountPercentage(e.target.value)}
                        placeholder="e.g. 20"
                      />
                    </div>
                  </div>

                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><CalendarRange /></div><b>Valid Until (optional)</b></div>
                    <div className="input-wrap">
                      <input
                        type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)}
                      />
                    </div>
                    <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>Leave blank for an offer with no expiry. Expired offers are hidden from the shared feed.</span>
                  </div>

                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><Boxes /></div><b>Link to one of your existing listings (optional)</b></div>
                    <CustomSelect
                      value={linkedPromotionId} onChange={setLinkedPromotionId}
                      options={[
                        { value: '', label: 'No linked listing' },
                        ...linkableListings.map(p => ({ value: p.id, label: `${p.title} (${p.type === 'AD' ? 'Advertisement' : 'Product'})` })),
                      ]}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
                <button
                  type="button" onClick={() => setShowAddModal(false)}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  {editingId ? 'Save Changes' : 'Publish Listing'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ============================================================================
// COMPONENT 6C: SUBSCRIPTION PRICING MANAGEMENT (SUPER ADMIN ONLY)
// Standalone screen dedicated only to subscription plan rates. Offers and
// banner ad management now live under the separate Promotions screen
// (see PromotionsView's "Banner Management" / "Offer Management" sub-tabs).
// ============================================================================
function PricingOffersView({ api }) {
  // Pricing states
  const [monthlyPrice, setMonthlyPrice] = useState(49);
  const [halfYearlyPrice, setHalfYearlyPrice] = useState(269);
  const [yearlyPrice, setYearlyPrice] = useState(499);
  const [pricingLoading, setPricingLoading] = useState(true);

  useEffect(() => {
    fetchPrices();
  }, []);

  const fetchPrices = async () => {
    setPricingLoading(true);
    try {
      const res = await api.getPlanPrices();
      setMonthlyPrice(res.MONTHLY ?? 49);
      setHalfYearlyPrice(res.HALF_YEARLY ?? 269);
      setYearlyPrice(res.YEARLY ?? 499);
    } catch (e) {
      console.error(e);
    } finally {
      setPricingLoading(false);
    }
  };

  const handleUpdatePrices = async (e) => {
    e.preventDefault();
    try {
      await api.updatePlanPrices({
        MONTHLY: Number(monthlyPrice),
        HALF_YEARLY: Number(halfYearlyPrice),
        YEARLY: Number(yearlyPrice)
      });
      alert('Subscription plan prices updated successfully!');
    } catch (err) {
      alert(`Update failed: ${err.message}`);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Tag /> Platform Finance</div>
          <h1>Subscription Pricing</h1>
          <p>Configure franchise subscription plan rates for the platform.</p>
        </div>
      </div>

      {!pricingLoading && (
        <div className="stat-grid three">
          <div className="stat-card" style={{ animationDelay: '.05s' }}>
            <div className="stat-top">
              <div className="icon-badge purple"><IndianRupee /></div>
              <span className="stat-trend"><Calendar />monthly</span>
            </div>
            <div className="stat-num"><CountUp value={Number(monthlyPrice) || 0} prefix="₹" /></div>
            <div className="stat-label">Monthly Recurring Plan</div>
          </div>
          <div className="stat-card" style={{ animationDelay: '.15s' }}>
            <div className="stat-top">
              <div className="icon-badge blue"><CalendarRange /></div>
              <span className="stat-trend"><Calendar />6-month</span>
            </div>
            <div className="stat-num"><CountUp value={Number(halfYearlyPrice) || 0} prefix="₹" /></div>
            <div className="stat-label">Half-Yearly Plan Rate</div>
          </div>
          <div className="stat-card" style={{ animationDelay: '.25s' }}>
            <div className="stat-top">
              <div className="icon-badge orange"><BadgePercent /></div>
              <span className="stat-trend"><Calendar />yearly</span>
            </div>
            <div className="stat-num"><CountUp value={Number(yearlyPrice) || 0} prefix="₹" /></div>
            <div className="stat-label">Yearly Discounted Rate</div>
          </div>
        </div>
      )}

      <div className="card" style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="section-title" style={{ marginBottom: 6 }}>
          <h2>Subscription Plan Pricing</h2>
        </div>
        <p className="cell-sub" style={{ marginBottom: 22, fontSize: 12.5 }}>
          Set rates for the key shops. These prices will automatically update the checkout gateway screen during provisioning.
        </p>

        {pricingLoading ? (
          <div style={{ display: 'flex', height: 140, alignItems: 'center', justifyContent: 'center' }}>
            <RefreshCw className="animate-spin" style={{ width: 26, height: 26, color: 'var(--gold)' }} />
          </div>
        ) : (
          <form onSubmit={handleUpdatePrices}>
            <div className="reg-section">

              <div className="reg-field">
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><IndianRupee /></div><b>Monthly Recurring Plan (&#8377;) <span className="req">*</span></b></div>
                <div className="input-wrap">
                  <input
                    type="number" required value={monthlyPrice} onChange={(e) => setMonthlyPrice(e.target.value)}
                  />
                </div>
                <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>Monthly recurring rental bill for platform service.</span>
              </div>

              <div className="reg-field">
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><CalendarRange /></div><b>6-Month Plan Rate (&#8377;) <span className="req">*</span></b></div>
                <div className="input-wrap">
                  <input
                    type="number" required value={halfYearlyPrice} onChange={(e) => setHalfYearlyPrice(e.target.value)}
                  />
                </div>
                <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>Discounted half-yearly upfront rate for shops.</span>
              </div>

              <div className="reg-field">
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><BadgePercent /></div><b>Yearly Plan Discounted Rate (&#8377;) <span className="req">*</span></b></div>
                <div className="input-wrap">
                  <input
                    type="number" required value={yearlyPrice} onChange={(e) => setYearlyPrice(e.target.value)}
                  />
                </div>
                <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>Discounted upfront annual rate for shops.</span>
              </div>
            </div>

            <div className="flex justify-end" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 4 }}>
              <button
                type="submit"
                className="btn btn-primary"
              >
                <Check />
                <span>Update Subscription Rates</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENT 7: REVENUE MANAGEMENT (SUPER ADMIN ONLY)
// ============================================================================
function RevenueManagementView({ api }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchRevenue();
  }, []);

  const fetchRevenue = async () => {
    setLoading(true);
    try {
      const res = await api.getRevenue();
      setRecords(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // `amount` comes straight off a text input's e.target.value, so it's a
    // string here (e.g. "25000") - Prisma's RevenueRecord.amount column is a
    // Float, so it must be coerced to a real number before it goes over the
    // wire, or the backend rejects the whole request.
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) {
      alert('Please enter a valid amount');
      return;
    }
    try {
      await api.logRevenue(Number(month), Number(year), numericAmount, notes);
      setAmount('');
      setNotes('');
      fetchRevenue();
    } catch (e) {
      alert(e.message);
    }
  };

  const totalCollected = records.reduce((acc, r) => acc + Number(r.amount), 0);
  const thisYear = new Date().getFullYear();
  const yearTotal = records.filter(r => r.year === thisYear).reduce((acc, r) => acc + Number(r.amount), 0);
  const avgPerRecord = records.length ? totalCollected / records.length : 0;

  const chartRecords = [...records]
    .sort((a, b) => (a.year - b.year) || (a.month - b.month))
    .slice(-8);
  const chartMax = Math.max(1, ...chartRecords.map(r => Number(r.amount)));

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><IndianRupee /> Platform Finance</div>
          <h1>Monthly Revenue Logs</h1>
          <p>Record subscription collections manually for SaaS performance tracking.</p>
        </div>
      </div>

      {!loading && records.length > 0 && (
        <div className="stat-grid three">
          <div className="stat-card" style={{ animationDelay: '.05s' }}>
            <div className="stat-top">
              <div className="icon-badge jgreen"><Banknote /></div>
              <span className="stat-trend"><TrendingUp />all-time</span>
            </div>
            <div className="stat-num"><CountUp value={totalCollected} decimals={2} prefix="₹" /></div>
            <div className="stat-label">Total Revenue Collected</div>
          </div>
          <div className="stat-card" style={{ animationDelay: '.15s' }}>
            <div className="stat-top">
              <div className="icon-badge blue"><Calendar /></div>
              <span className="stat-trend"><TrendingUp />{thisYear}</span>
            </div>
            <div className="stat-num"><CountUp value={yearTotal} decimals={2} prefix="₹" /></div>
            <div className="stat-label">Collected This Year</div>
          </div>
          <div className="stat-card" style={{ animationDelay: '.25s' }}>
            <div className="stat-top">
              <div className="icon-badge orange"><Receipt /></div>
            </div>
            <div className="stat-num"><CountUp value={records.length} /></div>
            <div className="stat-label">Revenue Records &mdash; avg &#8377;{avgPerRecord.toFixed(2)}</div>
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="card chart-card">
          <div className="section-title">
            <h2>Collections Trend</h2>
            <span className="sub">Last {chartRecords.length || 0} logged entries</span>
          </div>

          {loading ? (
            <div style={{ display: 'flex', height: 190, alignItems: 'center', justifyContent: 'center' }}>
              <RefreshCw className="animate-spin" style={{ width: 24, height: 24, color: 'var(--gold)' }} />
            </div>
          ) : chartRecords.length === 0 ? (
            <div style={{ display: 'flex', height: 190, alignItems: 'center', justifyContent: 'center', fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>
              No revenue logs recorded yet.
            </div>
          ) : (
            <div className="bars">
              {chartRecords.map(r => (
                <div className="bar-col" key={r.id}>
                  <div className="bar" style={{ height: `${Math.max(6, (Number(r.amount) / chartMax) * 100)}%` }} title={`\u20B9${Number(r.amount).toFixed(2)}`} />
                  <div className="bar-label">
                    {new Date(2000, r.month - 1).toLocaleString('default', { month: 'short' })} '{String(r.year).slice(-2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="section-title" style={{ marginBottom: 16 }}>
            <h2>Add Revenue Record</h2>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="reg-section">

              <div className="row2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="reg-field" style={{ marginBottom: 0 }}>
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Calendar /></div><b>Month</b></div>
                  <CustomSelect
                    value={month} onChange={(v) => setMonth(Number(v))}
                    options={Array.from({ length: 12 }, (_, i) => ({
                      value: i + 1,
                      label: new Date(2000, i).toLocaleString('default', { month: 'long' }),
                    }))}
                  />
                </div>
                <div className="reg-field" style={{ marginBottom: 0 }}>
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><CalendarRange /></div><b>Year</b></div>
                  <div className="input-wrap">
                    <input
                      type="number" required value={year} onChange={(e) => setYear(Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="reg-section">

              <div className="reg-field">
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><IndianRupee /></div><b>Amount Collected (&#8377;) <span className="req">*</span></b></div>
                <div className="input-wrap">
                  <input
                    type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)}
                    placeholder="2450.00"
                  />
                </div>
              </div>

              <div className="reg-field">
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><FileText /></div><b>Notes / Remarks</b></div>
                <textarea
                  rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="..."
                  style={{ width: '100%', background: 'var(--card-2)', border: '1.5px solid var(--border-2)', color: 'var(--text-0)', borderRadius: 13, padding: '13px 15px', fontSize: 13.5, outline: 'none', resize: 'vertical' }}
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
            >
              <Check />
              <span>Log Revenue Payout</span>
            </button>
          </form>
        </div>
      </div>

      <div className="card table-card" style={{ marginTop: 22 }}>
        <div className="table-head">
          <h2 style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 17 }}>Platform Revenue History</h2>
        </div>

        {loading ? (
          <div style={{ display: 'flex', height: 140, alignItems: 'center', justifyContent: 'center' }}>
            <RefreshCw className="animate-spin" style={{ width: 24, height: 24, color: 'var(--gold)' }} />
          </div>
        ) : records.length === 0 ? (
          <p style={{ padding: 24, fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>
            No revenue logs recorded yet.
          </p>
        ) : (
          <table className="kee-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Notes</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {[...records].sort((a, b) => (b.year - a.year) || (b.month - a.month)).map((r, idx) => {
                const rowColors = ['purple', 'blue', 'pink', 'orange', 'teal', 'jgreen', 'skyblue', 'rose', 'maroon'];
                const rowColor = rowColors[idx % rowColors.length];
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="cell-primary" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className={`icon-badge ${rowColor}`} style={{ width: 34, height: 34, borderRadius: 10 }}>
                          <Receipt className="h-4 w-4" />
                        </div>
                        {new Date(2000, r.month - 1).toLocaleString('default', { month: 'long' })} {r.year}
                      </div>
                    </td>
                    <td className="cell-sub" style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                      {r.notes || '—'}
                    </td>
                    <td className="cell-primary" style={{ color: 'var(--green)' }}>&#8377;{Number(r.amount).toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENT 8: BLANK KEY SEARCH (SHOP ADMIN ONLY)
// ============================================================================
function KeysSearchView({ api, searchDispatch }) {
  const { user } = useAuth();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedResult, setSelectedResult] = useState(null);

  useEffect(() => {
    performSearch();
  }, [query]);

  // Picks up a query dispatched from the global header search panel (filter = "Key").
  useEffect(() => {
    if (searchDispatch && searchDispatch.type === 'key') {
      setQuery(searchDispatch.query);
    }
  }, [searchDispatch?.nonce]);

  const performSearch = async () => {
    setLoading(true);
    try {
      const allMasterKeys = await api.getMasterKeys();
      
      let matchedKeys = allMasterKeys;
      if (query) {
        const q = query.toLowerCase();
        matchedKeys = allMasterKeys.filter(k =>
          (k.keyNumber && k.keyNumber.toLowerCase().includes(q)) ||
          (k.category && k.category.toLowerCase().includes(q))
        );
      }

      const matchingCustomers = await api.getGlobalCustomersForSearch(query);

      const items = [];

      // 1. Add matching customer registrations linked to key specs
      matchingCustomers.forEach(c => {
        const spec = allMasterKeys.find(k => k.keyNumber.toLowerCase() === c.keyNumber.toLowerCase());
        items.push({
          id: `cust-${c.id}`,
          keySpec: spec || {
            id: `spec-${c.id}`,
            keyNumber: c.keyNumber,
            category: 'Vehicle Keys',
            backImageUrl: null
          },
          customer: c
        });
      });

      // 2. Add matching general keys that aren't already included
      matchedKeys.forEach(k => {
        if (!items.some(item => item.keySpec.keyNumber.toLowerCase() === k.keyNumber.toLowerCase())) {
          items.push({
            id: `key-${k.id}`,
            keySpec: k,
            customer: null
          });
        }
      });

      setResults(items);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Search /> Duplicate Key Lookup</div>
          <h1>Master Key Catalog Search</h1>
          <p>Lookup blank specifications, key codes, and customer registry records in seconds.</p>
        </div>
      </div>

      <div className="reg-section" style={{ marginBottom: 'clamp(16px, 4vw, 24px)' }}>
        <div className="reg-field" style={{ marginBottom: 0 }}>
          <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><Search /></div><b>Key Code, Vehicle No, or Category</b></div>
          <div className="search-box" style={{ width: '100%', minWidth: 0, background: 'var(--card-2)' }}>
            <Search />
            <input
              type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by key code, vehicle number, customer location, category&hellip;"
              style={{ fontSize: 14, minWidth: 0 }}
            />
            {query && (
              <button onClick={() => setQuery('')} className="icon-btn" style={{ width: 26, height: 26 }}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
          <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Searching registry&hellip;</span>
        </div>
      ) : results.length === 0 ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 220 }}>
          <div className="icon-badge rose"><KeyRound /></div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>No matching keys or customer records found</span>
        </div>
      ) : (
        <div className="product-grid stagger-in">
          {(() => {
            const resultAccents = ['var(--purple)', 'var(--pink)', 'var(--blue)', 'var(--orange)', 'var(--teal)', 'var(--skyblue)', 'var(--rose)', 'var(--jgreen)'];
            return results.map((r, idx) => (
              <div
                key={r.id} onClick={() => setSelectedResult(r)}
                className="product-card"
                style={{ cursor: 'pointer' }}
              >
                <div className="product-img" style={{ background: r.customer ? 'linear-gradient(135deg, var(--maroon), var(--maroon-dark))' : resultAccents[idx % resultAccents.length] }}>
                  <KeyRound style={{ color: '#ffffff' }} />
                  <span className="product-tag">{r.keySpec.category}</span>
                </div>
                <div className="product-body">
                  <div className="flex items-center justify-between" style={{ gap: 8 }}>
                    <span className="pname" style={{ minWidth: 0, flex: 1, wordBreak: 'break-word' }}>{r.keySpec.keyNumber}</span>
                    <span className="pcat" style={{ marginBottom: 0, flexShrink: 0 }}>{r.keySpec.category}</span>
                  </div>
                  {r.customer && (
                    <div className="space-y-1">
                      <span className="badge badge-active"><span className="dot" />Registered Customer Key</span>
                      <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 12, padding: 8, marginTop: 4 }}>
                        <div className="flex items-center gap-2">
                          <div className="icon-badge jgreen" style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0 }}><Users style={{ width: 10, height: 10 }} /></div>
                          <p style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>Customer: <strong style={{ color: 'var(--text-0)' }}>{r.customer.name}</strong></p>
                        </div>
                        <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
                          <div className="icon-badge skyblue" style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0 }}><Car style={{ width: 10, height: 10 }} /></div>
                          <p style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>Vehicle No: <strong style={{ color: 'var(--green)' }}>{r.customer.vehicleNumber || 'N/A'}</strong></p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="product-foot" style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--gold)' }}>View Full Details</span>
                    <ExternalLink style={{ width: 13, height: 13, color: 'var(--gold)' }} />
                  </div>
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      {/* Details View Modal */}
      {selectedResult && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.85)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 620, margin: 'auto', padding: 28 }}>
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><KeyRound /> Key Details</span>
                <h2 style={{ fontSize: 19 }}>{selectedResult.keySpec.keyNumber}</h2>
              </div>
              <button onClick={() => setSelectedResult(null)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="reg-section">
              <div className="reg-field" style={{ marginBottom: selectedResult.keySpec.backImageUrl ? 13 : 0 }}>
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Tag /></div><b>Lock Category</b></div>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-0)' }}>{selectedResult.keySpec.category}</span>
              </div>

              {selectedResult.keySpec.backImageUrl && (
                <div className="reg-field" style={{ marginBottom: 0 }}>
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><ImageIcon /></div><b>Back Profile</b></div>
                  <img src={selectedResult.keySpec.backImageUrl} alt="Back profile" style={{ width: '100%', height: 128, borderRadius: 12, border: '1px solid var(--border-2)' }} className="object-cover" />
                </div>
              )}
            </div>

            {/* ASSOCIATED CUSTOMER REGISTRY SECTION */}
            {selectedResult.customer && (
              <div className="reg-section" style={{ marginBottom: 0 }}>

                {(user?.role === 'SUPER_ADMIN' || selectedResult.customer.shopId === user?.shopId) ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="reg-field">
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><User /></div><b>Customer Name</b></div>
                        <span style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 12.5 }}>{selectedResult.customer.name}</span>
                      </div>
                      <div className="reg-field">
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><Phone /></div><b>Phone Number</b></div>
                        <span style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 12.5 }}>{selectedResult.customer.phone}</span>
                      </div>
                      <div className="reg-field">
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Car /></div><b>Vehicle Number</b></div>
                        <span style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 12.5 }}>{selectedResult.customer.vehicleNumber || 'N/A'}</span>
                      </div>
                      <div className="reg-field">
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Calendar /></div><b>Registry Date</b></div>
                        <span style={{ color: 'var(--text-1)', fontWeight: 600, fontSize: 12.5 }}>{new Date(selectedResult.customer.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 14, borderRadius: 14, marginTop: 4 }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`icon-badge ${selectedResult.customer.latitude ? 'jgreen' : 'rose'}`} style={{ width: 32, height: 32, borderRadius: 10 }}>
                            <MapPin style={{ width: 16, height: 16 }} />
                          </div>
                          <div>
                            <p style={{ fontWeight: 700, color: 'var(--text-0)', fontSize: 13 }}>GPS Coordinates</p>
                            {selectedResult.customer.latitude && selectedResult.customer.longitude ? (
                              <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, fontWeight: 600 }}>Lat: {selectedResult.customer.latitude} &bull; Long: {selectedResult.customer.longitude}</p>
                            ) : (
                              <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, fontWeight: 600, fontStyle: 'italic' }}>Not captured</p>
                            )}
                          </div>
                        </div>
                        {selectedResult.customer.mapsLink && (
                          <a href={selectedResult.customer.mapsLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10.5, color: 'var(--gold)', fontWeight: 800 }} className="flex items-center gap-1 hover:underline">
                            <span>Google Maps</span><ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      {selectedResult.customer.capturedAddress && (
                        <div style={{ fontSize: 10.5, color: 'var(--text-2)', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8, paddingLeft: 42, fontWeight: 600 }}>
                          <span style={{ display: 'block', fontWeight: 800, fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase' }}>Captured Address</span>
                          <span>{selectedResult.customer.capturedAddress}</span>
                        </div>
                      )}
                    </div>

                    <div className="reg-field" style={{ marginTop: 13, marginBottom: 0 }}>
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><Camera /></div><b>Webcam Snapshot</b></div>
                      {selectedResult.customer.photoUrl ? (
                        <div style={{ width: '100%', height: 96, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-2)' }}>
                          <img src={getAssetUrl(selectedResult.customer.photoUrl)} alt="Customer" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div style={{ width: '100%', height: 96, borderRadius: 12, border: '1.5px dashed var(--border-2)' }} className="flex items-center justify-center">
                          <Camera style={{ width: 16, height: 16, color: 'var(--text-3)' }} />
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 16, borderRadius: 16 }} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="icon-badge maroon" style={{ width: 24, height: 24, borderRadius: 7 }}><ShieldCheck style={{ width: 12, height: 12 }} /></div>
                      <p style={{ fontSize: 10.5, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 800 }}>Registry Location Overview (Other Workspace)</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="reg-field">
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><User /></div><b>Customer Name</b></div>
                        <span style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 12.5 }}>{selectedResult.customer.name}</span>
                      </div>
                      <div className="reg-field">
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><Phone /></div><b>Customer Mobile</b></div>
                        <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: 12.5, fontFamily: 'monospace' }}>{selectedResult.customer.phone}</span>
                      </div>
                      <div className="reg-field">
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Store /></div><b>Registered Shop</b></div>
                        <span style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 12.5 }}>{selectedResult.customer.shop?.name || 'Key Shop Workspace'}</span>
                      </div>
                      <div className="reg-field" style={{ marginBottom: 0 }}>
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Phone /></div><b>Shop Mobile</b></div>
                        <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: 12.5, fontFamily: 'monospace' }}>
                          {(() => {
                            let shopMobile = 'N/A';
                            if (selectedResult.customer.shop) {
                              try {
                                const details = typeof selectedResult.customer.shop.companyDetails === 'string'
                                  ? JSON.parse(selectedResult.customer.shop.companyDetails)
                                  : selectedResult.customer.shop.companyDetails;
                                shopMobile = details?.phone || selectedResult.customer.shop.phone || 'N/A';
                              } catch(e) {
                                shopMobile = selectedResult.customer.shop.phone || 'N/A';
                              }
                            }
                            return shopMobile;
                          })()}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border)', padding: 10, borderRadius: 12, marginTop: 4 }}>
                      <AlertTriangle style={{ width: 14, height: 14, color: 'var(--text-3)', flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600, fontStyle: 'italic' }}>
                        Sensitive coordinates and webcam images are hidden since this key registration was created in another duplicate key shop.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
              <button onClick={() => setSelectedResult(null)} className="btn btn-ghost">
                Close Details
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function CustomerRegistrationWizard({ t, api, superAdminMode = false, shops = [], onDone, onCancel }) {
  const [step, setStep] = useState(1);
  // While mid-wizard (step > 1), hardware Back steps back one stage at a
  // time instead of skipping straight past the whole wizard. At step 1
  // there's nothing left to step back to here, so no handler is registered -
  // Back falls through to whatever is above this wizard (closes the
  // superAdminMode overlay via its own useBackHandler(showCreateWizard, ...),
  // or pops the screen stack when this is the plain 'register' tab).
  useBackHandler(step > 1, () => setStep((s) => Math.max(1, s - 1)));
  const [keysList, setKeysList] = useState([]);

  // Super Admin only: which shop this customer is being registered under.
  // Required before Step 1 can be completed - see the Shop dropdown below.
  const [selectedShopId, setSelectedShopId] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('N/A');
  const [idProofType, setIdProofType] = useState('Aadhaar Card');
  const [idProofNumber, setIdProofNumber] = useState('N/A');
  const [reason, setReason] = useState('N/A');
  const [keyNumber, setKeyNumber] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [stateVal, setStateVal] = useState('Tamil Nadu');
  const [district, setDistrict] = useState('Chennai');
  const [country, setCountry] = useState('India');
  const [masterKeyId, setMasterKeyId] = useState('');

  // Inline OTP states
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [enteredOtp, setEnteredOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [duplicateKeyWarning, setDuplicateKeyWarning] = useState(false);
  // Customers aren't required to have an email on file, so this is a
  // transient field used only to redirect the verification OTP to email
  // instead of SMS when testing — it is never saved to the customer record.
  const [otpMethod, setOtpMethod] = useState('phone');
  const [otpTestEmail, setOtpTestEmail] = useState('');
  const [otpDevCode, setOtpDevCode] = useState('');

  // Photos (Webcam support)
  const [photoBase64, setPhotoBase64] = useState(null);
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [webcamStream, setWebcamStream] = useState(null);
  const [camError, setCamError] = useState('');
  const [camErrorKind, setCamErrorKind] = useState('');
  const videoRef = useRef(null);

  // Document Uploads
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [uploadError, setUploadError] = useState('');

  // GPS Location Status
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [gpsTimestamp, setGpsTimestamp] = useState(null);
  const [gpsError, setGpsError] = useState('');
  const [gpsErrorKind, setGpsErrorKind] = useState('');
  const [isCapturingGps, setIsCapturingGps] = useState(false);
  const [capturedAddress, setCapturedAddress] = useState('');

  // Shop Admin: fetch their own shop's key catalog once on mount. Super Admin:
  // wait until a shop has been selected (Step 1's required dropdown), then
  // (re-)fetch scoped to that shop whenever the selection changes.
  useEffect(() => {
    if (superAdminMode && !selectedShopId) {
      setKeysList([]);
      setKeyNumber('');
      setMasterKeyId('');
      return;
    }
    const fetchKeys = async () => {
      try {
        const res = await api.getMasterKeys('', superAdminMode ? selectedShopId : '');
        setKeysList(res);
        if (res.length > 0) {
          setKeyNumber(res[0].keyNumber);
          setMasterKeyId(res[0].id);
        } else {
          setKeyNumber('');
          setMasterKeyId('');
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchKeys();
  }, [superAdminMode, selectedShopId]);

  useEffect(() => {
    if (addressLine || district || stateVal) {
      const finalAddress = `${addressLine}, ${district}, ${stateVal}, ${country}`;
      setAddress(finalAddress);
      setCapturedAddress(finalAddress);
    }
  }, [addressLine, district, stateVal, country]);

  // "Current Location" button for the Contact & Key step - captures the device's
  // real GPS position and reverse-geocodes it to best-effort prefill the address
  // line / state / district dropdowns. All of these stay fully editable afterwards
  // (this is a manual, explicit action - nothing auto-runs on the Review step
  // anymore, which is now a pure read-only summary).
  const captureCustomerLocation = async () => {
    setGpsError('');
    setGpsErrorKind('');
    setIsCapturingGps(true);
    let lat, lng;
    try {
      ({ lat, lng } = await resolveCurrentLocation());
    } catch (e) {
      setGpsError(e.message);
      setGpsErrorKind(e.kind || 'unavailable');
      setIsCapturingGps(false);
      return;
    }
    setLatitude(lat);
    setLongitude(lng);
    setGpsTimestamp(new Date().toISOString());
    const data = await reverseGeocode(lat, lng);
    if (data) {
      // Prefer the actual street (house number + road) for the editable
      // address line - this is the street-level detail that was missing
      // when this only pulled locality/city. Falls back to locality/city
      // for points without a mapped street (rural areas).
      const streetLine = data.street || data.locality || data.city;
      if (streetLine) setAddressLine(streetLine);

      const matchedState = Object.keys(INDIAN_STATES_DISTRICTS).find(
        st => st.toLowerCase() === (data.state || '').toLowerCase()
      );
      if (matchedState) {
        setStateVal(matchedState);
        const list = INDIAN_STATES_DISTRICTS[matchedState] || [];
        // Nominatim's district name often carries a "District"/"Taluk"/
        // "Tehsil" suffix (e.g. "Chennai District") that our district list
        // doesn't, so strip that before comparing. Try an exact match first,
        // then fall back to a loose substring match (handles minor naming
        // differences like "Bengaluru" vs "Bengaluru Urban"). Previously
        // this fell back to `list[0]` (the alphabetically-first district in
        // the state) whenever nothing matched, which silently populated a
        // wrong district instead of leaving the field for the user to
        // confirm/correct - removed that fallback.
        const rawDistrict = (data.district || data.city || '')
          .replace(/\s+(district|taluk|tehsil|mandal)$/i, '')
          .trim()
          .toLowerCase();
        const matchedDistrict = rawDistrict
          ? list.find(dt => dt.toLowerCase() === rawDistrict)
            || list.find(dt => dt.toLowerCase().includes(rawDistrict) || rawDistrict.includes(dt.toLowerCase()))
          : null;
        if (matchedDistrict) setDistrict(matchedDistrict);
      }
      // Nominatim's display_name is already a fully formatted address
      // (street, locality, city, state, postcode, country in order) - use it
      // directly for the read-only captured-address summary.
      if (data.displayName) setCapturedAddress(data.displayName);
    }
    setIsCapturingGps(false);
  };

  const startWebcam = async () => {
    setCamError('');
    setCamErrorKind('');
    try {
      const stream = await resolveCameraAccess();
      setWebcamStream(stream);
      setIsWebcamActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      setCamError(err.message || 'Camera access denied or unavailable. Please upload a photo instead.');
      setCamErrorKind(err.kind || 'unavailable');
    }
  };

  const stopWebcam = () => {
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      setWebcamStream(null);
    }
    setIsWebcamActive(false);
  };

  const captureSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg');
    setPhotoBase64(dataUrl);
    stopWebcam();
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoBase64(reader.result);
      stopWebcam();
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    return () => {
      if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [webcamStream]);

  useEffect(() => {
    if (step !== 2 && webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      setWebcamStream(null);
      setIsWebcamActive(false);
    }
  }, [step]);

  const handleFileChange = (e) => {
    setUploadError('');
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File size exceeds the 5MB limit');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Only JPEG, PNG, and PDF document formats are accepted');
      return;
    }

    if (uploadedDocs.some(d => d.type === idProofType)) {
      setUploadError(`Document for ${idProofType} is already staged.`);
      return;
    }

    const newDocs = [...uploadedDocs, { type: idProofType, file }];
    setUploadedDocs(newDocs);

    const remaining = ['Aadhaar Card', 'Driving License', 'PAN Card', 'Voter ID'].filter(
      t => !newDocs.some(d => d.type === t)
    );
    if (remaining.length > 0) {
      setIdProofType(remaining[0]);
    }
  };

  const handleSendOtp = async () => {
    if (!phone || !PHONE_REGEX.test(phone)) {
      alert(PHONE_REGEX_MESSAGE);
      return;
    }
    if (!keyNumber) {
      alert('Please enter a key code first');
      return;
    }
    if (otpMethod === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(otpTestEmail)) {
      alert('Please enter a valid email address to receive the test OTP.');
      return;
    }

    // Duplicate key validation check across current customer registry
    try {
      const allCusts = superAdminMode ? await api.getSuperCustomers() : await api.getCustomers();
      const duplicate = allCusts.find(c => c.keyNumber.toLowerCase() === keyNumber.trim().toLowerCase());
      if (duplicate) {
        setDuplicateKeyWarning(true);
        return;
      }
    } catch (e) {
      console.warn('Duplicate key validation check skipped:', e);
    }

    setDuplicateKeyWarning(false);
    setOtpError('');
    setOtpDevCode('');
    try {
      const identifier = otpMethod === 'email' ? otpTestEmail : phone;
      const result = await api.sendOtp(identifier, otpMethod, 'customer_verify');
      if (result?.devCode) setOtpDevCode(result.devCode);
      setOtpSent(true);
    } catch (e) {
      setOtpError(e.message || 'Failed to send OTP code.');
    }
  };

  const handleVerifyOtp = async () => {
    setOtpError('');
    try {
      const identifier = otpMethod === 'email' ? otpTestEmail : phone;
      await api.verifyOtp(identifier, otpMethod, 'customer_verify', enteredOtp);
      setOtpVerified(true);
    } catch (e) {
      setOtpError(e.message || 'Invalid OTP code. Please enter the correct code.');
    }
  };

  const handleFinalSubmit = async () => {
    try {
      // Only send real, device-captured coordinates. This used to fall back
      // to a hardcoded New Delhi city-center point (28.6139, 77.2090) and a
      // fake "Connaught Place, New Delhi, India" address whenever GPS
      // capture was skipped/failed - silently fabricating a location for
      // customers who could be anywhere in the country. Sending null instead
      // (both fields are optional in the backend DTO) means an uncaptured
      // location honestly shows as not-captured rather than lying about it.
      const finalLat = latitude || null;
      const finalLng = longitude || null;

      // If the typed key number matches an existing catalog entry, reference it
      // directly. Otherwise, send the "register this as a new key blank" details
      // inline as `manualKey` so the backend creates the MasterKey row in the SAME
      // transaction as the customer record — it can never be persisted without an
      // owning customer this way. (Previously this made a separate createShopKey()
      // call before createCustomer(); if the customer request failed afterwards for
      // any reason, the key row was left permanently orphaned with no customer.)
      let matchKey = keysList.find(k => k.keyNumber.toLowerCase() === keyNumber.toLowerCase());
      let finalMasterKeyId = masterKeyId || null;
      let manualKey = null;

      if (!matchKey && keyNumber) {
        manualKey = {
          category: 'Vehicle Keys',
        };
      } else if (matchKey) {
        finalMasterKeyId = matchKey.id;
      }

      const payload = {
        name, phone, address, idProofType, idProofNumber, reason,
        keyNumber, vehicleNumber, masterKeyId: finalMasterKeyId, manualKey,
        latitude: finalLat,
        longitude: finalLng,
        mapsLink: (finalLat && finalLng) ? `https://www.google.com/maps?q=${finalLat},${finalLng}` : null,
        capturedAddress: capturedAddress || address || null,
        photoBase64
      };

      const customer = superAdminMode
        ? await api.createSuperCustomer({ shopId: selectedShopId, ...payload })
        : await api.createCustomer(payload);

      for (const doc of uploadedDocs) {
        await api.uploadDocument(customer.id, doc.type, doc.file);
      }

      alert('Customer compliance record logged successfully!');
      if (superAdminMode && onDone) {
        onDone();
      } else {
        resetWizard();
      }
    } catch (e) {
      alert(`Submission failed: ${e.message}`);
    }
  };

  const resetWizard = () => {
    setSelectedShopId('');
    setName('');
    setPhone('');
    setAddress('N/A');
    setIdProofType('Aadhaar Card');
    setIdProofNumber('N/A');
    setReason('N/A');
    setKeyNumber('');
    setVehicleNumber('');
    setAddressLine('');
    setDistrict('');
    setStateVal('');
    setCountry('India');
    setOtpSent(false);
    setOtpVerified(false);
    setEnteredOtp('');
    setDuplicateKeyWarning(false);
    setPhotoBase64(null);
    setUploadedDocs([]);
    setLatitude(null);
    setLongitude(null);
    setGpsTimestamp(null);
    setGpsError('');
    setCapturedAddress('');
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
    }
    setWebcamStream(null);
    setIsWebcamActive(false);
    setStep(1);
  };

  const WIZARD_STEPS = [
    { name: 'Contact & Key' },
    { name: 'ID Photo' },
    { name: 'Documents' },
    { name: 'Review' },
  ];

  const plainInputStyle = {
    width: '100%', background: 'var(--card-2)', border: '1.5px solid var(--border-2)',
    color: 'var(--text-0)', borderRadius: 13, padding: '13px 15px', fontSize: 14, outline: 'none'
  };

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><UserPlus /> New Customer</div>
          <h1>{superAdminMode ? 'Register Customer' : t('register')}</h1>
          <p>Multi-step compliance onboarding — key issuance, identity capture &amp; GPS-stamped address, in five quick steps.</p>
        </div>
        {superAdminMode && onCancel && (
          <button type="button" onClick={onCancel} className="btn btn-ghost">
            <X className="h-4 w-4" /><span>Cancel</span>
          </button>
        )}
      </div>

      <div className="card wizard-card">
        <div className="step-indicator">
          {WIZARD_STEPS.map((s, i) => {
            const idx = i + 1;
            const done = step > idx;
            const current = step === idx;
            return (
              <React.Fragment key={s.name}>
                <div className={`step-item ${done ? 'done' : ''} ${current ? 'current' : ''}`}>
                  <div className="step-circle">{done ? <Check className="h-4 w-4" /> : idx}</div>
                  <div className="step-label">
                    <span className="num">Step {idx}</span>
                    <span className="name">{s.name}</span>
                  </div>
                </div>
                {i < WIZARD_STEPS.length - 1 && (
                  <div className="step-line"><div className="fill" style={{ width: done ? '100%' : '0%' }} /></div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        <div className="wizard-body">
          {step === 1 && (
            <div className="animate-fade-in">
              <h3>Contact &amp; Key Credentials</h3>
              <p className="desc">Register the customer's contact details, vehicle &amp; key code, and residential address.</p>

              {superAdminMode && (
                <div className="reg-section">
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><Store /></div><b>Shop <span className="req">*</span></b></div>
                    <CustomSelect
                      value={selectedShopId} onChange={setSelectedShopId}
                      placeholder="Select a shop…"
                      options={shops.map(s => ({ value: s.id, label: s.name }))}
                    />
                    <p style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginTop: 8 }}>
                      This customer, and its key code, will be registered under the selected shop's workspace.
                    </p>
                  </div>
                </div>
              )}

              {duplicateKeyWarning && (
                <div className="animate-fade-in" style={{ display: 'flex', gap: 12, background: 'var(--red-dim)', border: '1px solid rgba(242,86,77,0.3)', borderRadius: 16, padding: 16, marginBottom: 20 }}>
                  <div className="icon-badge red" style={{ width: 36, height: 36, borderRadius: 11 }}><AlertTriangle className="h-4 w-4" /></div>
                  <div>
                    <div style={{ color: 'var(--red)', fontWeight: 800, fontSize: 13, fontFamily: 'var(--display)' }}>Duplicate key detected</div>
                    <p style={{ color: 'var(--text-2)', fontSize: 12, fontWeight: 600, marginTop: 4, lineHeight: 1.5 }}>
                      Key code <b style={{ color: 'var(--text-0)' }}>{keyNumber}</b> is already registered to an existing customer. Please verify and enter a unique key code.
                    </p>
                  </div>
                </div>
              )}

              <div className="reg-section">
                <div className="form-grid">
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><User /></div><b>Full Customer Name <span className="req">*</span></b></div>
                    <div className="input-wrap">
                      <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Rohan Malhotra" />
                    </div>
                  </div>
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Car /></div><b>Vehicle Number <span className="req">*</span></b></div>
                    <div className="input-wrap">
                      <input type="text" required value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())} placeholder="e.g. TN09B1234" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="reg-section">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><KeyRound /></div><b>Key Code / Key Number <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="text" required value={keyNumber}
                      onChange={(e) => { setKeyNumber(e.target.value); setDuplicateKeyWarning(false); }}
                      placeholder="Enter key code (e.g. TN09B)"
                    />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Phone /></div><b>Phone Number <span className="req">*</span></b></div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div className="input-wrap" style={{ flex: 1 }}>
                      <input
                        type="tel" required value={phone}
                        onChange={(e) => { setPhone(e.target.value); setOtpVerified(false); setOtpSent(false); setOtpDevCode(''); }}
                        placeholder="98765 00000"
                      />
                    </div>
                    {!otpVerified && (
                      <button
                        type="button" onClick={handleSendOtp}
                        disabled={!phone || !keyNumber || (otpMethod === 'email' && !otpTestEmail)}
                        className="btn btn-primary btn-sm"
                      >
                        {otpSent ? 'Resend' : 'Send OTP'}
                      </button>
                    )}
                  </div>
                  {!otpVerified && !otpSent && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        type="button" onClick={() => setOtpMethod('phone')}
                        className={`store-tab ${otpMethod === 'phone' ? 'active' : ''}`}
                      >
                        <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.03em' }}>SMS to phone</span>
                      </button>
                      <button
                        type="button" onClick={() => setOtpMethod('email')}
                        className={`store-tab ${otpMethod === 'email' ? 'active' : ''}`}
                      >
                        <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.03em' }}>Email (testing)</span>
                      </button>
                      {otpMethod === 'email' && (
                        <input
                          type="email" value={otpTestEmail} onChange={(e) => setOtpTestEmail(e.target.value)}
                          placeholder="test@email.com — for OTP only, not saved"
                          style={{ flex: '1 1 220px', background: 'var(--card-2)', border: '1.5px solid var(--border-2)', color: 'var(--text-0)', borderRadius: 10, padding: '8px 12px', fontSize: 12, outline: 'none' }}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="reg-section">
                <div className="reg-field">
                  <div className="reg-field-label">
                    <div className="reg-ico" style={{ background: 'var(--teal)' }}><MapPin /></div>
                    <b>Address Line <span className="req">*</span></b>
                    <button
                      type="button"
                      onClick={captureCustomerLocation}
                      disabled={isCapturingGps}
                      className="reg-trailing loc-btn"
                    >
                      <Crosshair className={isCapturingGps ? 'animate-spin' : ''} />
                      <span>{isCapturingGps ? 'Locating…' : 'Current Location'}</span>
                    </button>
                  </div>
                  <div className="input-wrap">
                    <input type="text" required value={addressLine} onChange={(e) => setAddressLine(e.target.value)} placeholder="e.g. Flat 101, Park Avenue" />
                  </div>
                  {gpsError && (
                    <div style={{ marginTop: 6 }}>
                      <p style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 700 }}>{gpsError}</p>
                      {gpsErrorKind === 'disabled' && (
                        <button
                          type="button"
                          onClick={openDeviceLocationSettings}
                          className="cursor-pointer select-none"
                          style={{ fontSize: 10.5, color: 'var(--gold)', fontWeight: 800, background: 'none', border: 'none', padding: 0, textDecoration: 'underline', marginTop: 2 }}
                        >
                          Open Location Settings
                        </button>
                      )}
                      {gpsErrorKind === 'permission' && IS_NATIVE_APP && (
                        <button
                          type="button"
                          onClick={openAppSettings}
                          className="cursor-pointer select-none"
                          style={{ fontSize: 10.5, color: 'var(--gold)', fontWeight: 800, background: 'none', border: 'none', padding: 0, textDecoration: 'underline', marginTop: 2 }}
                        >
                          Open App Settings
                        </button>
                      )}
                    </div>
                  )}
                  {latitude && longitude && !gpsError && (
                    <p style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginTop: 6 }}>GPS captured: {latitude.toFixed(5)}, {longitude.toFixed(5)}</p>
                  )}
                </div>

                <div className="form-grid" style={{ marginBottom: 13 }}>
                  <div className="reg-field" style={{ marginBottom: 0 }}>
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Navigation /></div><b>State</b></div>
                    <CustomSelect
                      value={stateVal}
                      onChange={(selected) => {
                        setStateVal(selected);
                        const list = INDIAN_STATES_DISTRICTS[selected] || [];
                        setDistrict(list[0] || '');
                      }}
                      options={Object.keys(INDIAN_STATES_DISTRICTS)}
                    />
                  </div>
                  <div className="reg-field" style={{ marginBottom: 0 }}>
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><MapPin /></div><b>District</b></div>
                    <CustomSelect
                      value={district} onChange={setDistrict}
                      options={INDIAN_STATES_DISTRICTS[stateVal] || []}
                    />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><Building2 /></div><b>Country</b></div>
                  <div className="input-wrap" style={{ opacity: 0.65 }}>
                    <input type="text" readOnly value={country} style={{ cursor: 'not-allowed' }} />
                  </div>
                </div>
              </div>

              {otpSent && !otpVerified && (
                <div className="animate-fade-in" style={{ background: 'var(--card-2)', border: '1.5px solid var(--border-2)', borderRadius: 16, padding: 18, marginTop: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                    <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600 }}>
                      Enter the 4-digit code sent {otpMethod === 'email' ? `to ${otpTestEmail}` : "to the customer's phone"}
                    </span>
                  </div>
                  {otpDevCode && (
                    <div style={{ background: 'var(--bg-1)', border: '1.5px dashed var(--gold)', borderRadius: 12, padding: '10px 14px', textAlign: 'center', marginBottom: 14 }}>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>
                        Testing mode &mdash; no {otpMethod === 'email' ? 'SMTP' : 'SMS'} provider configured
                      </p>
                      <p style={{ fontSize: 20, color: 'var(--gold)', fontWeight: 800, letterSpacing: '.2em' }}>{otpDevCode}</p>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, maxWidth: 280 }}>
                    <input
                      type="text" maxLength={4} value={enteredOtp}
                      onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="1234"
                      style={{ ...plainInputStyle, textAlign: 'center', fontWeight: 800, letterSpacing: 4 }}
                    />
                    <button type="button" onClick={handleVerifyOtp} className="btn btn-primary btn-sm" style={{ whiteSpace: 'nowrap' }}>
                      Verify OTP
                    </button>
                  </div>
                  {otpError && <p style={{ color: 'var(--red)', fontSize: 11, fontWeight: 700, marginTop: 10 }}>{otpError}</p>}
                </div>
              )}

              {otpVerified && (
                <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--green-dim)', border: '1px solid rgba(62,207,106,0.3)', borderRadius: 14, padding: '12px 16px', marginTop: 20 }}>
                  <Check className="h-4 w-4" style={{ color: 'var(--green)' }} />
                  <span style={{ color: 'var(--green)', fontSize: 12.5, fontWeight: 700 }}>Customer {otpMethod === 'email' ? 'email' : 'phone number'} OTP verified successfully.</span>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="animate-fade-in">
              <h3>Identity Photo Capture</h3>
              <p className="desc">Capture a live photo via webcam, or upload an existing image for the compliance record.</p>

              <div className="reg-section">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
                  <div className="capture-preview" style={{ width: 260, height: 200, borderRadius: 20, overflow: 'hidden', background: 'var(--card-2)', border: '1.5px solid var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isWebcamActive ? (
                      <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : photoBase64 ? (
                      <img src={photoBase64} alt="Identity preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div className="icon-badge pink" style={{ width: 56, height: 56, borderRadius: 16 }}><Camera className="h-6 w-6" /></div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', width: '100%' }}>
                    {isWebcamActive ? (
                      <>
                        <button type="button" onClick={captureSnapshot} className="btn btn-primary btn-sm">
                          <Camera className="h-4 w-4" /> Capture Photo
                        </button>
                        <button type="button" onClick={stopWebcam} className="btn btn-danger-outline btn-sm">
                          <X className="h-4 w-4" /> Stop Camera
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={startWebcam} className="btn btn-outline btn-sm">
                          <Camera className="h-4 w-4" /> {photoBase64 ? 'Re-take Photo' : 'Start Webcam / Mobile Cam'}
                        </button>
                        <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                          <UploadCloud className="h-4 w-4" />
                          <span>Upload Image</span>
                          <input type="file" accept="image/*" style={{ display: 'none' }} onClick={primeStoragePermission} onChange={handlePhotoUpload} />
                        </label>
                      </>
                    )}
                  </div>

                  {camError && (
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 700 }}>{camError}</p>
                      {camErrorKind === 'permission' && IS_NATIVE_APP && (
                        <button
                          type="button"
                          onClick={openAppSettings}
                          className="cursor-pointer select-none"
                          style={{ fontSize: 10.5, color: 'var(--gold)', fontWeight: 800, background: 'none', border: 'none', padding: 0, textDecoration: 'underline', marginTop: 2 }}
                        >
                          Open App Settings
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-fade-in">
              <h3>Compliance Document Upload</h3>
              <p className="desc">Upload a copy of the government ID proof used to verify this customer.</p>

              <div className="reg-section">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><FileCheck /></div><b>Document Type</b></div>
                  <CustomSelect
                    value={idProofType} onChange={setIdProofType}
                    options={[
                      { value: 'Aadhaar Card', label: 'Aadhaar Card', disabled: uploadedDocs.some(d => d.type === 'Aadhaar Card') },
                      { value: 'Driving License', label: 'Driving License', disabled: uploadedDocs.some(d => d.type === 'Driving License') },
                      { value: 'PAN Card', label: 'PAN Card', disabled: uploadedDocs.some(d => d.type === 'PAN Card') },
                      { value: 'Voter ID', label: 'Voter ID', disabled: uploadedDocs.some(d => d.type === 'Voter ID') },
                    ]}
                  />
                </div>
              </div>

              <div className="reg-section">
                <label htmlFor="docUploadInput" className="dropzone">
                  <div className="icon-badge orange"><UploadCloud className="h-5 w-5" /></div>
                  <div className="dz-title">Drop or browse a copy of {idProofType}</div>
                  <div className="dz-sub">JPEG, PNG or PDF — up to 5MB</div>
                  <input type="file" id="docUploadInput" onClick={primeStoragePermission} onChange={handleFileChange} style={{ display: 'none' }} accept="image/jpeg, image/png, application/pdf" />
                </label>
                {uploadError && <p style={{ color: 'var(--red)', fontSize: 12, fontWeight: 700, marginTop: 12, textAlign: 'center' }}>{uploadError}</p>}

                {uploadedDocs.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
                    <span className="side-section-label" style={{ padding: 0 }}>Staged ID copies ({uploadedDocs.length})</span>
                    {uploadedDocs.map((doc, idx) => {
                      const docColors = ['purple', 'pink', 'blue', 'orange', 'teal', 'skyblue', 'rose', 'jgreen'];
                      const docColor = docColors[idx % docColors.length];
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 13, padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className={`icon-badge ${docColor}`} style={{ width: 26, height: 26, borderRadius: 8 }}><FileCheck style={{ width: 13, height: 13 }} /></div>
                            <span style={{ color: 'var(--gold)', fontWeight: 800, fontSize: 12.5, fontFamily: 'var(--display)' }}>{doc.type}</span>
                          </div>
                          <span style={{ color: 'var(--text-3)', fontSize: 12, fontWeight: 600, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.file.name}</span>
                          <button type="button" onClick={() => setUploadedDocs(uploadedDocs.filter((_, i) => i !== idx))} className="icon-btn">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="animate-fade-in">
              <h3>Review</h3>
              <p className="desc">Verify every detail entered below before submitting this compliance registration. Nothing is captured or modified automatically on this step.</p>

              <div className="reg-section">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="icon-badge purple" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }}><User style={{ width: 16, height: 16 }} /></div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>Customer</div>
                      <div style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 13.5 }}>{name}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="icon-badge blue" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }}><Phone style={{ width: 16, height: 16 }} /></div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>Phone</div>
                      <div style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 13.5 }}>{phone}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="icon-badge orange" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }}><Car style={{ width: 16, height: 16 }} /></div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>Vehicle Number</div>
                      <div style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 13.5 }}>{vehicleNumber}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="icon-badge pink" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }}><KeyRound style={{ width: 16, height: 16 }} /></div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>Key Blank</div>
                      <div style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 13.5 }}>{keyNumber}</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3" style={{ marginTop: 16 }}>
                  <div className="icon-badge teal" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }}><MapPin style={{ width: 16, height: 16 }} /></div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>Registered Address</div>
                    <div style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 13.5 }}>{addressLine}, {district}, {stateVal}, India</div>
                  </div>
                </div>
              </div>

              <div className="reg-section">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="icon-badge skyblue" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }}><Fingerprint style={{ width: 16, height: 16 }} /></div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>ID Proof Type</div>
                      <div style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 13.5 }}>{idProofType}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="icon-badge rose" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }}><FileCheck style={{ width: 16, height: 16 }} /></div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>Uploaded Documents</div>
                      <div style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 13.5 }}>{uploadedDocs.length > 0 ? `${uploadedDocs.length} file(s) attached` : 'None attached'}</div>
                    </div>
                  </div>
                </div>
              </div>

              <span className="side-section-label" style={{ padding: 0, display: 'block', marginBottom: 12 }}>Location</span>
              {latitude && longitude ? (
                <div className="loc-box">
                  <div className="loc-info">
                    <div className="icon-badge green"><Crosshair className="h-5 w-5" /></div>
                    <div className="loc-text">
                      <div className="t1">GPS Captured</div>
                      <div className="t2">Lat {Number(latitude).toFixed(5)} · Long {Number(longitude).toFixed(5)}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 16, padding: 16 }}>
                  <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>
                    No GPS location was captured. Go back to the "Contact &amp; Key" step and use the "Current Location" button if you'd like to attach coordinates.
                  </p>
                </div>
              )}
              {capturedAddress && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--text-2)', fontWeight: 600, marginTop: 12 }}>
                  <MapPin className="h-4 w-4" style={{ color: 'var(--green)', flexShrink: 0, marginTop: 2 }} />
                  <span>{capturedAddress}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="wizard-foot">
          {step > 1 ? (
            <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          ) : <span />}

          <div className="wizard-foot-right" style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <span className="wizard-foot-steplabel" style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 700 }}>Step {step} of {WIZARD_STEPS.length}</span>

            {step === 1 && (
              <button
                type="button" className="btn btn-primary"
                disabled={!name || !phone || !keyNumber || !vehicleNumber || !otpVerified || !addressLine || !district || !stateVal || duplicateKeyWarning || (superAdminMode && !selectedShopId)}
                onClick={() => setStep(2)}
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            )}
            {step === 2 && (
              <button type="button" className="btn btn-primary" disabled={!photoBase64} onClick={() => setStep(3)}>
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            )}
            {step === 3 && (
              <button type="button" className="btn btn-primary" onClick={() => setStep(4)}>
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            )}
            {step === 4 && (
              <button type="button" className="btn btn-primary" onClick={handleFinalSubmit}>
                Submit Compliance Record <Check className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENT 10: CUSTOMER HISTORY LOOKUP (SHOP ADMIN ONLY)
// ============================================================================
function CustomerHistoryView({ t, api, searchDispatch }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCust, setSelectedCust] = useState(null);

  // Picks up a query dispatched from the global header search panel
  // (filter = "Customer").
  useEffect(() => {
    if (searchDispatch && searchDispatch.type === 'customer') {
      setSearch(searchDispatch.query);
    }
  }, [searchDispatch?.nonce]);

  // Edit States
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhoneVal, setEditPhoneVal] = useState('');
  const [editVehicleNumber, setEditVehicleNumber] = useState('');
  const [editKeyNumber, setEditKeyNumber] = useState('');
  const [editAddressLine, setEditAddressLine] = useState('');
  const [editDistrict, setEditDistrict] = useState('');
  const [editStateVal, setEditStateVal] = useState('');
  const [editIdProofType, setEditIdProofType] = useState('Aadhaar Card');
  const [editIdProofNumber, setEditIdProofNumber] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editUploadFile, setEditUploadFile] = useState(null);

  useEffect(() => {
    if (selectedCust) {
      setEditName(selectedCust.name || '');
      setEditPhoneVal(selectedCust.phone || '');
      setEditVehicleNumber(selectedCust.vehicleNumber || '');
      setEditKeyNumber(selectedCust.keyNumber || '');
      const remainingEditTypes = ['Aadhaar Card', 'Driving License', 'PAN Card', 'Voter ID'].filter(
        t => !selectedCust.documents?.some(d => d.documentType === t || d.documentType === `${t} Copy`)
      );
      if (remainingEditTypes.length > 0) {
        setEditIdProofType(remainingEditTypes[0]);
      } else {
        setEditIdProofType(selectedCust.idProofType || 'Aadhaar Card');
      }
      setEditIdProofNumber(selectedCust.idProofNumber || '');
      setEditReason(selectedCust.reason || '');
      
      const addr = selectedCust.capturedAddress || selectedCust.address || '';
      const parts = addr.split(',').map(p => p.trim());
      setEditAddressLine(parts[0] || '');
      setEditDistrict(parts[1] || '');
      setEditStateVal(parts[2] || '');
    } else {
      setIsEditing(false);
      setEditUploadFile(null);
    }
  }, [selectedCust]);

  useEffect(() => {
    fetchHistory();
  }, [search]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await api.getCustomers(search);
      setCustomers(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveChanges = async (e) => {
    e.preventDefault();
    if (!editPhoneVal || !PHONE_REGEX.test(editPhoneVal)) {
      alert(PHONE_REGEX_MESSAGE);
      return;
    }
    try {
      const finalAddress = `${editAddressLine}, ${editDistrict}, ${editStateVal}, India`;
      await api.updateCustomer(selectedCust.id, {
        name: editName,
        phone: editPhoneVal,
        address: finalAddress,
        idProofType: editIdProofType,
        idProofNumber: editIdProofNumber,
        reason: editReason,
        keyNumber: editKeyNumber,
        vehicleNumber: editVehicleNumber,
        capturedAddress: finalAddress
      });

      if (editUploadFile) {
        await api.uploadDocument(selectedCust.id, `${editIdProofType} Copy`, editUploadFile);
      }

      alert('Customer compliance record updated successfully!');
      setIsEditing(false);
      setEditUploadFile(null);
      setSelectedCust(null);
      fetchHistory();
    } catch (err) {
      alert(err.message || 'Failed to save customer edits.');
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><FileCheck /> Compliance Registry</div>
          <h1>{t('history')}</h1>
          <p>Search and verify past duplicate-key registrations and compliance submissions.</p>
        </div>
      </div>

      {/* The search box lives outside the loading/results swap below so it
          never unmounts while typing - every keystroke re-triggers the
          fetch (briefly flipping `loading`), but the input itself stays
          mounted the whole time and keeps focus. */}
      <div className="card table-card">
        <div className="table-head">
          <div className="search-box">
            <Search />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, key code&hellip;"
            />
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 200 }}>
            <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Loading compliance records&hellip;</span>
          </div>
        ) : customers.length === 0 ? (
          <p style={{ padding: 24, fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>
            No compliance records match this search.
          </p>
        ) : (
        <table className="kee-table history-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th>Vehicle</th>
              <th>Key Code</th>
              <th>Location</th>
              <th>Logged</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const rowColors = ['purple', 'blue', 'pink', 'orange', 'teal', 'jgreen', 'skyblue', 'rose', 'maroon'];
              return customers.map((c, idx) => {
                const rowColor = rowColors[idx % rowColors.length];
                return (
                  <tr key={c.id} onClick={() => setSelectedCust(c)} style={{ cursor: 'pointer' }}>
                    <td data-label="Customer">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className={`icon-badge ${rowColor}`} style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0 }}>
                          <User style={{ width: 15, height: 15 }} />
                        </div>
                        <div className="cell-primary">{c.name}</div>
                      </div>
                    </td>
                    <td className="cell-sub" data-label="Phone" style={{ fontWeight: 700, color: 'var(--text-2)' }}>{c.phone}</td>
                    <td className="cell-sub" data-label="Vehicle" style={{ fontWeight: 700, color: 'var(--text-2)' }}>{c.vehicleNumber || 'N/A'}</td>
                    <td data-label="Key Code">
                      <span className="badge badge-active"><span className="dot" />{c.keyNumber}</span>
                    </td>
                    <td className="cell-sub" data-label="Location" style={{ fontWeight: 700, color: 'var(--text-2)', maxWidth: 180 }}>
                      <span className="flex items-center gap-1" style={{ overflow: 'hidden' }}>
                        <MapPin style={{ width: 13, height: 13, color: 'var(--green)', flexShrink: 0 }} />
                        <span className="truncate">{c.capturedAddress || 'N/A'}</span>
                      </span>
                    </td>
                    <td className="cell-sub" data-label="Logged" style={{ fontWeight: 700, color: 'var(--text-2)' }}>{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td data-label="Actions">
                      <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                        <button onClick={(e) => { e.stopPropagation(); setSelectedCust(c); }} className="icon-btn" title="View compliance file">
                          <Eye />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
        )}
      </div>

      {selectedCust && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.82)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 640, margin: 'auto', padding: 28 }}>
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><FileCheck /> Compliance File</span>
                <h2 style={{ fontSize: 19 }}>{selectedCust.name}</h2>
              </div>
              <button onClick={() => setSelectedCust(null)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            {!isEditing ? (
              <>
                <div className="reg-section">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Phone /></div><b>Phone Contact</b></div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{selectedCust.phone}</span>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Calendar /></div><b>Registry Date</b></div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{new Date(selectedCust.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><Car /></div><b>Vehicle Number</b></div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{selectedCust.vehicleNumber || 'N/A'}</span>
                    </div>
                    <div className="reg-field" style={{ marginBottom: 0 }}>
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><KeyRound /></div><b>Key Blank Code</b></div>
                      <span className="badge badge-active"><span className="dot" />{selectedCust.keyNumber}</span>
                    </div>
                  </div>
                </div>

                <div className="reg-section">
                  <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 16, padding: 14 }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`icon-badge ${selectedCust.latitude ? 'jgreen' : 'rose'}`} style={{ width: 32, height: 32, borderRadius: 10 }}>
                          <MapPin style={{ width: 16, height: 16 }} />
                        </div>
                        <div>
                          <p style={{ fontWeight: 700, color: 'var(--text-0)', fontSize: 13 }}>GPS Coordinates</p>
                          {selectedCust.latitude && selectedCust.longitude ? (
                            <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, fontWeight: 600 }}>Lat: {selectedCust.latitude} &bull; Long: {selectedCust.longitude}</p>
                          ) : (
                            <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, fontWeight: 600, fontStyle: 'italic' }}>Not captured</p>
                          )}
                        </div>
                      </div>
                      {selectedCust.mapsLink && (
                        <a href={selectedCust.mapsLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10.5, color: 'var(--gold)', fontWeight: 800 }} className="flex items-center gap-1 hover:underline">
                          <span>Google Maps</span><ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {selectedCust.capturedAddress && (
                      <div style={{ fontSize: 10.5, color: 'var(--text-2)', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8, paddingLeft: 42, fontWeight: 600 }}>
                        <span style={{ display: 'block', fontWeight: 800, fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase' }}>Captured Address</span>
                        <span>{selectedCust.capturedAddress}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="reg-section" style={{ marginBottom: 0 }}>
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Camera /></div><b>Webcam Photo</b></div>
                    {selectedCust.photoUrl ? (
                      <div style={{ width: '100%', height: 128, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-2)' }}>
                        <img src={getAssetUrl(selectedCust.photoUrl)} alt="Customer snapshot" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div style={{ width: '100%', height: 128, borderRadius: 12, border: '1.5px dashed var(--border-2)' }} className="flex items-center justify-center">
                        <Camera style={{ width: 18, height: 18, color: 'var(--text-3)' }} />
                      </div>
                    )}
                  </div>

                  {selectedCust.documents && selectedCust.documents.length > 0 && (
                    <div className="reg-field space-y-2" style={{ marginBottom: 0 }}>
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><FileCheck /></div><b>Attached ID Copies</b></div>
                      {selectedCust.documents.map((d, di) => {
                        const docColors = ['purple', 'pink', 'blue', 'orange', 'teal', 'skyblue', 'rose', 'jgreen'];
                        const docColor = docColors[di % docColors.length];
                        return (
                          <div key={d.id} style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 10, borderRadius: 12 }} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <div className={`icon-badge ${docColor}`} style={{ width: 26, height: 26, borderRadius: 8 }}>
                                <FileText style={{ width: 13, height: 13 }} />
                              </div>
                              <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{d.documentType} ({d.fileKey})</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => downloadAsset(d.fileUrl, d.originalName || d.fileKey || 'document')}
                              style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--gold)' }}
                              className="hover:underline"
                            >
                              Download
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
                  <button onClick={() => setIsEditing(true)} className="btn btn-primary btn-sm">
                    <Edit /> Edit Details
                  </button>
                  <button onClick={() => setSelectedCust(null)} className="btn btn-ghost btn-sm">Close File</button>
                </div>
              </>
            ) : (
              <form onSubmit={handleSaveChanges}>
                <div className="reg-section">
                  <div className="form-grid">
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><User /></div><b>Full Customer Name</b></div>
                      <div className="input-wrap">
                        <input type="text" required value={editName} onChange={(e) => setEditName(e.target.value)} />
                      </div>
                    </div>
                    <div className="reg-field" style={{ marginBottom: 0 }}>
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Phone /></div><b>Phone Number</b></div>
                      <div className="input-wrap">
                        <input type="tel" required value={editPhoneVal} onChange={(e) => setEditPhoneVal(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="reg-section">
                  <div className="form-grid">
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Car /></div><b>Vehicle Number</b></div>
                      <div className="input-wrap">
                        <input type="text" required value={editVehicleNumber} onChange={(e) => setEditVehicleNumber(e.target.value.toUpperCase())} />
                      </div>
                    </div>
                    <div className="reg-field" style={{ marginBottom: 0 }}>
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><KeyRound /></div><b>Key Blank Code</b></div>
                      <div className="input-wrap">
                        <input type="text" required value={editKeyNumber} onChange={(e) => setEditKeyNumber(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="reg-section">

                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><MapPin /></div><b>Address Line</b></div>
                    <div className="input-wrap">
                      <input type="text" required value={editAddressLine} onChange={(e) => setEditAddressLine(e.target.value)} />
                    </div>
                  </div>

                  <div className="form-grid">
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Navigation /></div><b>District</b></div>
                      <div className="input-wrap">
                        <input type="text" required value={editDistrict} onChange={(e) => setEditDistrict(e.target.value)} />
                      </div>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><Navigation /></div><b>State</b></div>
                      <div className="input-wrap">
                        <input type="text" required value={editStateVal} onChange={(e) => setEditStateVal(e.target.value)} />
                      </div>
                    </div>
                    <div className="reg-field full" style={{ marginBottom: 0 }}>
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Navigation /></div><b>Country</b></div>
                      <div className="input-wrap">
                        <input type="text" readOnly value="India" style={{ opacity: .55, cursor: 'not-allowed' }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="reg-section" style={{ marginBottom: 0 }}>
                  <div className="form-grid">
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><ShieldCheck /></div><b>Document ID Type</b></div>
                      <CustomSelect
                        value={editIdProofType} onChange={setEditIdProofType}
                        options={[
                          { value: 'Aadhaar Card', label: 'Aadhaar Card', disabled: selectedCust?.documents?.some(d => d.documentType === 'Aadhaar Card' || d.documentType === 'Aadhaar Card Copy') },
                          { value: 'Driving License', label: 'Driving License', disabled: selectedCust?.documents?.some(d => d.documentType === 'Driving License' || d.documentType === 'Driving License Copy') },
                          { value: 'PAN Card', label: 'PAN Card', disabled: selectedCust?.documents?.some(d => d.documentType === 'PAN Card' || d.documentType === 'PAN Card Copy') },
                          { value: 'Voter ID', label: 'Voter ID', disabled: selectedCust?.documents?.some(d => d.documentType === 'Voter ID' || d.documentType === 'Voter ID Copy') },
                        ]}
                      />
                    </div>
                    <div className="reg-field" style={{ marginBottom: 0 }}>
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><UploadCloud /></div><b>Upload New File Copy</b></div>
                      <div className="dropzone" style={{ padding: '16px 12px', position: 'relative' }}>
                        <UploadCloud style={{ width: 20, height: 20, color: 'var(--gold)' }} />
                        <span className="dz-sub">{editUploadFile ? editUploadFile.name : 'JPEG, PNG or PDF'}</span>
                        <input
                          type="file"
                          onClick={primeStoragePermission}
                          onChange={(e) => setEditUploadFile(e.target.files[0])}
                          accept="image/jpeg, image/png, application/pdf"
                          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditUploadFile(null);
                    }}
                    className="btn btn-ghost"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Save Changes
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ============================================================================
// COMPONENT 11.5: CUSTOMER CARE VIEW (SUPPORT & SKILLS TRAINING)
// ============================================================================
export function CustomerCareView({ t, api }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await api.getSupportConfig();
      setConfig(res);
    } catch (e) {
      console.error('Failed to load support config:', e);
    } finally {
      setLoading(false);
    }
  };

  const getYoutubeThumbnailAndId = (url) => {
    if (!url) return { id: null, thumbnail: 'https://images.unsplash.com/photo-1619542402915-dcaf30e4e2a1?w=300&q=80' };
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    const videoId = (match && match[2].length === 11) ? match[2] : null;
    return {
      id: videoId,
      thumbnail: videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : 'https://images.unsplash.com/photo-1619542402915-dcaf30e4e2a1?w=300&q=80'
    };
  };

  if (loading) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
        <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Loading support resources&hellip;</span>
      </div>
    );
  }

  const whatsapp = config?.whatsapp || '+91 98765 43210';
  const cleanPhone = whatsapp.replace(/[^0-9]/g, '');

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Phone /> Customer Care</div>
          <h1>Support & Training Center</h1>
          <p>Reach Key Shop technical support and level up with locksmith training resources.</p>
        </div>
      </div>

      <div className="grid-2">
        {/* Support Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 22 }}>
          <div>
            <div className="flex items-center gap-3" style={{ marginBottom: 10 }}>
              <div className="icon-badge maroon"><Phone /></div>
              <div>
                <h2 style={{ fontSize: 16 }}>Contact Live Agent</h2>
                <span className="pill-badge" style={{ marginTop: 6 }}><Clock style={{ width: 11, height: 11 }} />Mon&ndash;Sat, 9 AM&ndash;7 PM IST</span>
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600, lineHeight: 1.6 }}>
              Live customer support is on hand to help with your key-making machines or duplicate key portal dashboard.
            </p>
          </div>

          <div className="loc-box" style={{ background: 'rgba(37,211,102,0.08)', borderColor: 'rgba(37,211,102,0.28)' }}>
            <div className="loc-info">
              <div className="icon-badge jgreen">
                <MessageCircle />
              </div>
              <div className="loc-text">
                <span className="t1" style={{ display: 'block' }}>{whatsapp}</span>
                <span className="t2">Direct WhatsApp Support</span>
              </div>
            </div>
            <a
              href={`https://wa.me/${cleanPhone || '919876543210'}?text=Hi%20Key%20Shop%20Support%2C%20I%20have%20a%20question%20regarding%20my%20duplicate%20key%20shop%20platform.`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm"
              style={{ background: '#25d366', color: '#062b17', flexShrink: 0 }}
            >
              <MessageCircle /> Chat on WhatsApp
            </a>
          </div>
        </div>

        {/* Video Resources Card */}
        <div className="card">
          <div className="section-title" style={{ marginBottom: 14 }}>
            <div className="flex items-center gap-3">
              <div className="icon-badge teal" style={{ width: 34, height: 34, borderRadius: 10 }}>
                <Radio style={{ width: 16, height: 16 }} />
              </div>
              <div>
                <h2 style={{ fontSize: 16 }}>Locksmith Skill Upgrades</h2>
                <span className="sub">Video tutorials from duplicate key experts</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
            {config?.videos && config.videos.length > 0 ? (
              config.videos.map((vid, idx) => {
                const { thumbnail } = getYoutubeThumbnailAndId(vid.url);
                const badgeColors = ['purple', 'pink', 'blue', 'orange', 'teal', 'skyblue', 'rose', 'jgreen'];
                const badgeColor = badgeColors[idx % badgeColors.length];
                return (
                  <div key={idx} className="product-card" style={{ borderRadius: 14 }}>
                    <div className="product-img" style={{ height: 92 }}>
                      <img src={thumbnail} alt={vid.name} className="w-full h-full object-cover" style={{ position: 'absolute', inset: 0, opacity: .6 }} />
                      <a
                        href={vid.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center"
                        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }}
                      >
                        <span className={`icon-badge ${badgeColor} animate-pulse`} style={{ width: 32, height: 32, borderRadius: 999 }}>
                          <PlayCircle style={{ width: 18, height: 18 }} />
                        </span>
                      </a>
                    </div>
                    <div className="product-body" style={{ padding: 12, gap: 4 }}>
                      <span style={{ fontSize: 9, color: 'var(--gold)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '.05em' }}>Training Material</span>
                      <h4 className="pname" style={{ fontSize: 12.5 }}>{vid.name}</h4>
                      <a href={vid.url} target="_blank" rel="noreferrer" style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600 }} className="hover:underline truncate block">Watch Link</a>
                    </div>
                  </div>
                );
              })
            ) : (
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, fontStyle: 'italic', gridColumn: '1 / -1', padding: '32px 0', textAlign: 'center' }}>
                No skill upgrade videos currently available.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENT 11.6: SUPPORT CONFIG VIEW (SUPER ADMIN SUPPORT CONFIGURATION)
// ============================================================================
export function SupportConfigView({ t, api }) {
  const [whatsapp, setWhatsapp] = useState('');
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Shop Categories management - the Super-Admin-curated list of shop
  // "types" (e.g. Dealers) that populates the Category dropdown on the
  // public self-registration wizard. Kept independent from the
  // whatsapp/videos form above: its own fetch, its own save-per-action.
  const [categories, setCategories] = useState([]);
  const [catLoading, setCatLoading] = useState(true);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [editingCatId, setEditingCatId] = useState(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [savingCatId, setSavingCatId] = useState(null);

  // Product Types management - the Super-Admin-curated list of Inventory
  // "product types" (e.g. Key Cutting Machines) that populates the Product
  // Type dropdown on the Inventory Product Creation form. Mirrors the Shop
  // Categories block above: its own fetch, its own save-per-action.
  const [productTypes, setProductTypes] = useState([]);
  const [ptLoading, setPtLoading] = useState(true);
  const [newProductTypeName, setNewProductTypeName] = useState('');
  const [addingProductType, setAddingProductType] = useState(false);
  const [editingPtId, setEditingPtId] = useState(null);
  const [editingPtName, setEditingPtName] = useState('');
  const [savingPtId, setSavingPtId] = useState(null);

  useEffect(() => {
    fetchConfig();
    fetchCategories();
    fetchProductTypes();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await api.getSupportConfig();
      setWhatsapp(res.whatsapp || '');
      setVideos(res.videos || []);
    } catch (e) {
      console.error('Failed to load support config:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateSupportConfig({ whatsapp, videos });
      alert('Support configuration updated successfully!');
    } catch (e) {
      alert(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await api.getShopCategories();
      setCategories(res || []);
    } catch (e) {
      console.error('Failed to load shop categories:', e);
    } finally {
      setCatLoading(false);
    }
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      alert('Please enter a category name.');
      return;
    }
    setAddingCategory(true);
    try {
      await api.createShopCategory(name);
      setNewCategoryName('');
      await fetchCategories();
    } catch (e) {
      alert(`Failed to add category: ${e.message}`);
    } finally {
      setAddingCategory(false);
    }
  };

  const handleStartEditCategory = (cat) => {
    setEditingCatId(cat.id);
    setEditingCatName(cat.name);
  };

  const handleSaveEditCategory = async (id) => {
    const name = editingCatName.trim();
    if (!name) {
      alert('Please enter a category name.');
      return;
    }
    setSavingCatId(id);
    try {
      await api.updateShopCategory(id, name);
      setEditingCatId(null);
      await fetchCategories();
    } catch (e) {
      alert(`Failed to update category: ${e.message}`);
    } finally {
      setSavingCatId(null);
    }
  };

  const handleDeleteCategory = async (cat) => {
    if (!confirm(`Delete the "${cat.name}" category? Shops already using it keep it, but it will no longer be offered on the registration form.`)) return;
    setSavingCatId(cat.id);
    try {
      await api.deleteShopCategory(cat.id);
      await fetchCategories();
    } catch (e) {
      alert(`Failed to delete category: ${e.message}`);
    } finally {
      setSavingCatId(null);
    }
  };

  const fetchProductTypes = async () => {
    try {
      const res = await api.getProductTypes();
      setProductTypes(res || []);
    } catch (e) {
      console.error('Failed to load product types:', e);
    } finally {
      setPtLoading(false);
    }
  };

  const handleAddProductType = async () => {
    const name = newProductTypeName.trim();
    if (!name) {
      alert('Please enter a product type name.');
      return;
    }
    setAddingProductType(true);
    try {
      await api.createProductType(name);
      setNewProductTypeName('');
      await fetchProductTypes();
    } catch (e) {
      alert(`Failed to add product type: ${e.message}`);
    } finally {
      setAddingProductType(false);
    }
  };

  const handleStartEditProductType = (pt) => {
    setEditingPtId(pt.id);
    setEditingPtName(pt.name);
  };

  const handleSaveEditProductType = async (id) => {
    const name = editingPtName.trim();
    if (!name) {
      alert('Please enter a product type name.');
      return;
    }
    setSavingPtId(id);
    try {
      await api.updateProductType(id, name);
      setEditingPtId(null);
      await fetchProductTypes();
    } catch (e) {
      alert(`Failed to update product type: ${e.message}`);
    } finally {
      setSavingPtId(null);
    }
  };

  const handleDeleteProductType = async (pt) => {
    if (!confirm(`Delete the "${pt.name}" product type? Listings already using it keep it, but it will no longer be offered on the Inventory Product Creation form.`)) return;
    setSavingPtId(pt.id);
    try {
      await api.deleteProductType(pt.id);
      await fetchProductTypes();
    } catch (e) {
      alert(`Failed to delete product type: ${e.message}`);
    } finally {
      setSavingPtId(null);
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
        <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Loading support configuration&hellip;</span>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><LifeBuoy /> Platform Support</div>
          <h1>Customer Support Configuration</h1>
          <p>Configure the global customer care contact and training video links visible to every shop.</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        <form onSubmit={handleSave}>
          <div className="reg-section">
            <div className="reg-field" style={{ marginBottom: 0 }}>
              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><MessageCircle /></div><b>Customer Support WhatsApp Number <span className="req">*</span></b></div>
              <div className="input-wrap">
                <input
                  type="text" required value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                />
              </div>
            </div>
          </div>

          <div className="reg-section" style={{ marginBottom: 0 }}>
            <div className="reg-section-head" style={{ justifyContent: 'flex-end' }}>
              <span className="sub" style={{ marginRight: 10 }}>{videos.length} video{videos.length === 1 ? '' : 's'}</span>
              <button
                type="button"
                onClick={() => setVideos([...videos, { name: '', url: '' }])}
                className="btn btn-outline btn-sm"
              >
                <Plus /> Add Video
              </button>
            </div>

            {videos.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, fontStyle: 'italic' }}>
                No videos configured. Click &ldquo;Add Video&rdquo; to add locksmith training links.
              </p>
            ) : (
              <div className="space-y-3" style={{ maxHeight: 380, overflowY: 'auto', paddingRight: 4, paddingTop: 2 }}>
                {videos.map((vid, idx) => {
                  const rowColors = ['purple', 'pink', 'blue', 'orange', 'teal', 'skyblue', 'rose', 'jgreen'];
                  const rowColor = rowColors[idx % rowColors.length];
                  return (
                  <div key={idx} style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 14, padding: 16, position: 'relative' }}>
                    <button
                      type="button"
                      onClick={() => setVideos(videos.filter((_, i) => i !== idx))}
                      className="icon-btn"
                      style={{ position: 'absolute', top: 12, right: 12, color: 'var(--red)' }}
                      title="Remove video"
                    >
                      <X />
                    </button>
                    <div className="form-grid" style={{ paddingRight: 36 }}>
                      <div className="reg-field" style={{ marginBottom: 0 }}>
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: `var(--${rowColor})` }}><PlayCircle /></div><b>Video Title / Name</b></div>
                        <div className="input-wrap">
                          <input
                            type="text" required value={vid.name}
                            onChange={(e) => {
                              const newVids = [...videos];
                              newVids[idx].name = e.target.value;
                              setVideos(newVids);
                            }}
                            placeholder="e.g. Locksmith Career Income"
                          />
                        </div>
                      </div>
                      <div className="reg-field" style={{ marginBottom: 0 }}>
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><ExternalLink /></div><b>YouTube URL</b></div>
                        <div className="input-wrap">
                          <input
                            type="url" required value={vid.url}
                            onChange={(e) => {
                              const newVids = [...videos];
                              newVids[idx].url = e.target.value;
                              setVideos(newVids);
                            }}
                            placeholder="https://www.youtube.com/watch?v=..."
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="form-action-bar flex justify-end" style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 20, marginBottom: 8 }}>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? <RefreshCw className="animate-spin" /> : <Check />}
              <span>Save Configuration</span>
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ maxWidth: 720, marginTop: 20 }}>
        <div className="reg-section" style={{ marginBottom: 0 }}>
          <div className="reg-section-head" style={{ justifyContent: 'flex-end' }}>
            <span className="sub" style={{ marginRight: 10 }}>{categories.length} categor{categories.length === 1 ? 'y' : 'ies'}</span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, marginBottom: 14 }}>
            Manage the shop "type" options offered on the public self-registration wizard's Category dropdown.
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="e.g. Dealers" style={{ flex: 1 }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }}
            />
            <button type="button" onClick={handleAddCategory} disabled={addingCategory} className="btn btn-outline btn-sm">
              {addingCategory ? <RefreshCw className="animate-spin" /> : <Plus />} Add
            </button>
          </div>

          {catLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
              <RefreshCw className="animate-spin" style={{ width: 22, height: 22, color: 'var(--gold)' }} />
            </div>
          ) : categories.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, fontStyle: 'italic' }}>
              No shop categories yet. Add one above - the registration form's dropdown will be empty until you do.
            </p>
          ) : (
            <div className="space-y-3" style={{ maxHeight: 340, overflowY: 'auto', paddingRight: 4 }}>
              {categories.map((cat) => (
                <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 12, padding: '10px 14px', marginBottom: 8 }}>
                  {editingCatId === cat.id ? (
                    <>
                      <input
                        type="text" value={editingCatName} onChange={(e) => setEditingCatName(e.target.value)}
                        style={{ flex: 1 }} autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveEditCategory(cat.id); } }}
                      />
                      <button type="button" onClick={() => handleSaveEditCategory(cat.id)} disabled={savingCatId === cat.id} className="icon-btn" title="Save" style={{ color: 'var(--jgreen)' }}>
                        {savingCatId === cat.id ? <RefreshCw className="animate-spin h-4 w-4" /> : <Check className="h-4 w-4" />}
                      </button>
                      <button type="button" onClick={() => setEditingCatId(null)} className="icon-btn" title="Cancel">
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <Tag style={{ width: 16, height: 16, color: 'var(--text-3)', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{cat.name}</span>
                      <button type="button" onClick={() => handleStartEditCategory(cat)} className="icon-btn" title="Edit">
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        type="button" onClick={() => handleDeleteCategory(cat)} disabled={savingCatId === cat.id}
                        className="icon-btn" style={{ color: 'var(--red)' }} title="Delete"
                      >
                        {savingCatId === cat.id ? <RefreshCw className="animate-spin h-4 w-4" /> : <Trash className="h-4 w-4" />}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ maxWidth: 720, marginTop: 20 }}>
        <div className="reg-section" style={{ marginBottom: 0 }}>
          <div className="reg-section-head" style={{ justifyContent: 'flex-end' }}>
            <span className="sub" style={{ marginRight: 10 }}>{productTypes.length} type{productTypes.length === 1 ? '' : 's'}</span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, marginBottom: 14 }}>
            Manage the Product Type options offered on the Inventory Product Creation form.
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              type="text" value={newProductTypeName} onChange={(e) => setNewProductTypeName(e.target.value)}
              placeholder="e.g. Key Cutting Machines" style={{ flex: 1 }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddProductType(); } }}
            />
            <button type="button" onClick={handleAddProductType} disabled={addingProductType} className="btn btn-outline btn-sm">
              {addingProductType ? <RefreshCw className="animate-spin" /> : <Plus />} Add
            </button>
          </div>

          {ptLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
              <RefreshCw className="animate-spin" style={{ width: 22, height: 22, color: 'var(--gold)' }} />
            </div>
          ) : productTypes.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, fontStyle: 'italic' }}>
              No product types yet. Add one above - the Inventory Product Creation dropdown will be empty until you do.
            </p>
          ) : (
            <div className="space-y-3" style={{ maxHeight: 340, overflowY: 'auto', paddingRight: 4 }}>
              {productTypes.map((pt) => (
                <div key={pt.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 12, padding: '10px 14px', marginBottom: 8 }}>
                  {editingPtId === pt.id ? (
                    <>
                      <input
                        type="text" value={editingPtName} onChange={(e) => setEditingPtName(e.target.value)}
                        style={{ flex: 1 }} autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveEditProductType(pt.id); } }}
                      />
                      <button type="button" onClick={() => handleSaveEditProductType(pt.id)} disabled={savingPtId === pt.id} className="icon-btn" title="Save" style={{ color: 'var(--jgreen)' }}>
                        {savingPtId === pt.id ? <RefreshCw className="animate-spin h-4 w-4" /> : <Check className="h-4 w-4" />}
                      </button>
                      <button type="button" onClick={() => setEditingPtId(null)} className="icon-btn" title="Cancel">
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <Layers style={{ width: 16, height: 16, color: 'var(--text-3)', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{pt.name}</span>
                      <button type="button" onClick={() => handleStartEditProductType(pt)} className="icon-btn" title="Edit">
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        type="button" onClick={() => handleDeleteProductType(pt)} disabled={savingPtId === pt.id}
                        className="icon-btn" style={{ color: 'var(--red)' }} title="Delete"
                      >
                        {savingPtId === pt.id ? <RefreshCw className="animate-spin h-4 w-4" /> : <Trash className="h-4 w-4" />}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ShopSettingsView({ t, api }) {
  const { user } = useAuth();
  const [shopName, setShopName] = useState('');
  const [address, setAddress] = useState('');
  const [gst, setGst] = useState('');
  const [phone, setPhone] = useState('');
  const [shopPhoto, setShopPhoto] = useState(null);
  const [shopLicense, setShopLicense] = useState(null);
  const [ownerAadhaar, setOwnerAadhaar] = useState(null);
  const [docUploading, setDocUploading] = useState(null); // which doc slot is currently uploading
  const [loading, setLoading] = useState(true);

  // Verification states
  const [revealPassword, setRevealPassword] = useState(false);
  const [showPassVerifyModal, setShowPassVerifyModal] = useState(false);
  const [passVerifyInput, setPassVerifyInput] = useState('');
  const [passVerifyError, setPassVerifyError] = useState('');
  useBackHandler(showPassVerifyModal, () => { setShowPassVerifyModal(false); setPassVerifyError(''); });
  const [passVerifyLoading, setPassVerifyLoading] = useState(false);
  const [showVerifyPass, setShowVerifyPass] = useState(false);
  const [otpShowNewPass, setOtpShowNewPass] = useState(false);
  const [otpShowConfirmPass, setOtpShowConfirmPass] = useState(false);
  const [revealedPasswordVal, setRevealedPasswordVal] = useState('');

  // OTP Reset states inside Settings
  const [otpResetOpen, setOtpResetOpen] = useState(false);
  const [otpResetMethod, setOtpResetMethod] = useState(null); // 'email' | 'phone'
  const [otpResetIdentifier, setOtpResetIdentifier] = useState('');
  const [otpResetOtpInput, setOtpResetOtpInput] = useState('');
  const [otpResetSent, setOtpResetSent] = useState(false);
  const [otpResetVerified, setOtpResetVerified] = useState(false);
  const [otpResetNewPassword, setOtpResetNewPassword] = useState('');
  const [otpResetConfirmPassword, setOtpResetConfirmPassword] = useState('');
  const [otpResetLoading, setOtpResetLoading] = useState(false);
  const [otpResetError, setOtpResetError] = useState('');
  const [otpResetSuccess, setOtpResetSuccess] = useState(false);
  const [otpResetDevCode, setOtpResetDevCode] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  // Maps the local UI slot key to the ShopDocument.documentType value the
  // backend uses (see backend/src/common/shop-document.util.ts).
  const DOC_TYPE_BY_KEY = { shopPhoto: 'SHOP_PHOTO', shopLicense: 'SHOP_LICENSE', ownerAadhaar: 'OWNER_AADHAAR' };
  const DOC_SETTERS = { shopPhoto: setShopPhoto, shopLicense: setShopLicense, ownerAadhaar: setOwnerAadhaar };
  const DOC_VALUES = () => ({ shopPhoto, shopLicense, ownerAadhaar });

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await api.getSettings();
      setShopName(res.name);

      if (res.companyDetails) {
        try {
          const details = JSON.parse(res.companyDetails);
          setAddress(details.address || '');
          setGst(details.gst || '');
          setPhone(details.phone || '');
        } catch (err) {
          setAddress('');
          setGst('');
          setPhone('');
        }
      }

      // Verification documents now come from the relational ShopDocument
      // table (res.documents), not from companyDetails JSON. Only the
      // most-recent active document per type is kept (the backend already
      // soft-deletes the previous one on replace, but findMany could still
      // return more than one in edge cases, so pick the newest defensively).
      const docsByType = {};
      for (const doc of res.documents || []) {
        const existing = docsByType[doc.documentType];
        if (!existing || new Date(doc.createdAt) > new Date(existing.createdAt)) {
          docsByType[doc.documentType] = doc;
        }
      }
      for (const key of Object.keys(DOC_TYPE_BY_KEY)) {
        DOC_SETTERS[key](docsByType[DOC_TYPE_BY_KEY[key]] || null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const persistCompanyDetails = async (overrides = {}) => {
    const companyDetails = JSON.stringify({ address, phone, gst, ...overrides });
    await api.updateSettings({ name: shopName, companyDetails });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!PHONE_REGEX.test(phone)) {
      alert(PHONE_REGEX_MESSAGE);
      return;
    }
    try {
      await persistCompanyDetails();
      alert('Shop workspace settings saved successfully!');
    } catch (e) {
      alert(e.message);
    }
  };

  const handleDocUpload = async (docType, file) => {
    if (!file) return;
    setDocUploading(docType);
    try {
      // Backend soft-deletes any existing active document of this type and
      // creates a new ShopDocument row - no separate delete call needed here.
      const uploaded = await api.uploadSettingsDocument(DOC_TYPE_BY_KEY[docType], file);
      DOC_SETTERS[docType](uploaded);
    } catch (err) {
      alert(err.message || 'Document upload failed');
    } finally {
      setDocUploading(null);
    }
  };

  const handleDocRemove = async (docType) => {
    const current = DOC_VALUES()[docType];
    if (!current) return;
    if (!confirm('Remove this document?')) return;
    try {
      await api.deleteSettingsDocument(current.id);
      DOC_SETTERS[docType](null);
    } catch (err) {
      alert(err.message || 'Failed to remove document');
    }
  };

  const handlePasswordVerificationSubmit = async (e) => {
    e.preventDefault();
    setPassVerifyError('');
    setPassVerifyLoading(true);
    try {
      await api.changePassword(passVerifyInput, passVerifyInput);
      setRevealedPasswordVal(passVerifyInput);
      setRevealPassword(true);
      setShowPassVerifyModal(false);
      setPassVerifyInput('');
    } catch (err) {
      setPassVerifyError(err.message || 'Incorrect password entered.');
    } finally {
      setPassVerifyLoading(false);
    }
  };

  // OTP Reset handlers
  const handleOtpResetSend = async () => {
    if (!otpResetIdentifier) {
      alert('Please enter your registered email or phone number');
      return;
    }
    setOtpResetDevCode('');
    try {
      const result = await api.sendOtp(otpResetIdentifier, otpResetMethod || 'email', 'reset');
      if (result?.devCode) setOtpResetDevCode(result.devCode);
      setOtpResetSent(true);
      setOtpResetError('');
    } catch (err) {
      alert(err.message || 'Failed to send OTP code.');
    }
  };

  const handleOtpResetVerify = async (e) => {
    e.preventDefault();
    setOtpResetLoading(true);
    try {
      await api.verifyOtp(otpResetIdentifier, otpResetMethod || 'email', 'reset', otpResetOtpInput);
      setOtpResetVerified(true);
      setOtpResetError('');
    } catch (err) {
      setOtpResetError(err.message || 'Invalid OTP code. Please enter the correct code.');
    } finally {
      setOtpResetLoading(false);
    }
  };

  const handleOtpResetSubmit = async (e) => {
    e.preventDefault();
    if (otpResetNewPassword !== otpResetConfirmPassword) {
      setOtpResetError('Passwords do not match');
      return;
    }
    setOtpResetLoading(true);
    try {
      await api.resetPasswordPublic(otpResetIdentifier, otpResetMethod || 'email', otpResetNewPassword);
      setRevealedPasswordVal(otpResetNewPassword);
      setOtpResetSuccess(true);
      alert('Password updated successfully!');
      setOtpResetOpen(false);
      // Reset flow variables
      setOtpResetSent(false);
      setOtpResetVerified(false);
      setOtpResetIdentifier('');
      setOtpResetOtpInput('');
      setOtpResetNewPassword('');
      setOtpResetConfirmPassword('');
      setOtpResetDevCode('');
    } catch (err) {
      setOtpResetError(err.message || 'Failed to update password');
    } finally {
      setOtpResetLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
        <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Loading workspace settings…</span>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Settings /> Workspace Configuration</div>
          <h1>{t('settings')}</h1>
          <p>Manage your shop profile, branding, verification documents, and account security.</p>
        </div>
        <button onClick={fetchSettings} className="icon-btn" title="Refresh"><RefreshCw /></button>
      </div>

      <div className="grid-2">
      <div>
      <div className="card">
        <div className="section-title">
          <h2 style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Store style={{ width: 16, height: 16, color: 'var(--gold)' }} />
            Workspace Profile
          </h2>
          <span className="sub">Business identity &amp; contact details</span>
        </div>

        <form onSubmit={handleUpdate}>
          <div className="reg-section">
            <div className="reg-field">
              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Store /></div><b>Workspace Display Name <span className="req">*</span></b></div>
              <div className="input-wrap">
                <input type="text" required value={shopName} onChange={(e) => setShopName(e.target.value)} />
              </div>
            </div>

            <div className="reg-field">
              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Phone /></div><b>Phone Number <span className="req">*</span></b></div>
              <div className="input-wrap">
                <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91..." />
              </div>
            </div>

            <div className="reg-field" style={{ marginBottom: 0 }}>
              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><MapPin /></div><b>Registered Address <span className="req">*</span></b></div>
              <div className="input-wrap">
                <input type="text" required value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Shop Verification Documents Section */}
          <div className="reg-section" style={{ marginBottom: 0 }}>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { key: 'shopPhoto', label: 'Shop Photo', value: shopPhoto, icon: Camera, fileName: 'shop_photo', color: 'purple' },
                { key: 'shopLicense', label: 'Shop License', value: shopLicense, icon: FileCheck, fileName: 'shop_license', color: 'skyblue' },
                { key: 'ownerAadhaar', label: 'Owner Aadhaar', value: ownerAadhaar, icon: Fingerprint, fileName: 'owner_aadhaar', color: 'maroon' },
              ].map(({ key, label, value, icon: SlotIcon, fileName, color }) => {
                const isPdf = value && value.fileUrl && value.fileUrl.toLowerCase().endsWith('.pdf');
                const uploading = docUploading === key;
                return (
                  <div key={key} style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="flex items-center justify-between">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        <span className={`icon-badge ${color}`} style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0 }}><SlotIcon style={{ width: 10, height: 10 }} /></span>
                        {label}
                      </span>
                      <span className={`badge ${value ? 'badge-active' : 'badge-pending'}`} style={{ padding: '2px 8px', fontSize: 9 }}>
                        <span className="dot"></span>{value ? 'Uploaded' : 'Missing'}
                      </span>
                    </div>
                    {value ? (
                      <div style={{ height: 74, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-2)', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isPdf ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--red)', fontWeight: 800 }}>
                            <FileText style={{ width: 15, height: 15 }} /> PDF File
                          </span>
                        ) : (
                          <img src={getAssetUrl(value.fileUrl)} className="w-full h-full object-cover" alt={`${label} Preview`} />
                        )}
                      </div>
                    ) : (
                      <div style={{ height: 74, borderRadius: 10, border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
                        <SlotIcon style={{ width: 20, height: 20 }} />
                      </div>
                    )}
                    <div className="flex gap-2">
                      {value ? (
                        <>
                          <button
                            type="button"
                            onClick={() => downloadAsset(value.fileUrl, value.originalName || filenameForAsset(value.fileUrl, fileName))}
                            className="btn btn-primary btn-sm"
                            style={{ flex: 1, fontSize: 10.5, padding: '8px 10px' }}
                          >
                            <Download style={{ width: 12, height: 12 }} />
                            <span>Download</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDocRemove(key)}
                            className="btn btn-danger-outline btn-sm"
                            style={{ flex: 1, fontSize: 10.5, padding: '8px 10px' }}
                          >
                            <Trash style={{ width: 12, height: 12 }} />
                            <span>Remove</span>
                          </button>
                        </>
                      ) : (
                        <label className="btn btn-ghost btn-sm btn-block" style={{ fontSize: 10.5, padding: '8px 10px', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
                          {uploading ? <RefreshCw className="animate-spin" style={{ width: 12, height: 12 }} /> : <Upload style={{ width: 12, height: 12 }} />}
                          <span>{uploading ? 'Uploading…' : 'Upload'}</span>
                          <input
                            type="file" accept="image/jpeg,image/png,application/pdf" className="hidden" disabled={uploading}
                            onClick={primeStoragePermission}
                            onChange={(e) => { const file = e.target.files[0]; e.target.value = ''; handleDocUpload(key, file); }}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="form-action-bar flex justify-end" style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 20 }}>
            <button type="submit" className="btn btn-primary">
              <Check />
              <span>Save Workspace Details</span>
            </button>
          </div>
        </form>
      </div>
      </div>

      <div>
      {/* Admin User Credentials Block */}
      <div className="card">
        <div className="section-title">
          <h2 style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck style={{ width: 16, height: 16, color: 'var(--gold)' }} />
            Admin Credentials
          </h2>
        </div>

        <div className="reg-section">
          <div className="reg-field" style={{ marginBottom: 12 }}>
            <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><User /></div><b>Username / Name</b></div>
            <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-0)', fontFamily: 'var(--display)' }}>{user.name}</p>
          </div>
          <div className="reg-field" style={{ marginBottom: 12 }}>
            <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Mail /></div><b>Email Address</b></div>
            <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-0)' }}>{user.email}</p>
          </div>
          <div className="reg-field" style={{ marginBottom: 0 }}>
            <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><Phone /></div><b>Phone Number</b></div>
            <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-0)' }}>{phone || 'N/A'}</p>
          </div>
        </div>

        <div className="reg-section" style={{ marginBottom: 0 }}>
          <div className="reg-field" style={{ marginBottom: 14 }}>
            <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><KeyRound /></div><b>Workspace Password</b></div>
            <div className="flex items-center justify-between" style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 13, padding: '10px 14px' }}>
              <div className="flex items-center gap-2">
                {revealPassword ? (
                  <span style={{ color: 'var(--gold)', fontFamily: 'monospace', fontWeight: 800, fontSize: 13 }}>{revealedPasswordVal}</span>
                ) : (
                  <span style={{ color: 'var(--text-3)', fontFamily: 'monospace', letterSpacing: '.15em' }}>••••••••</span>
                )}
              </div>
              <button
                onClick={() => (revealPassword ? setRevealPassword(false) : setShowPassVerifyModal(true))}
                className="icon-btn"
                title={revealPassword ? 'Hide password' : 'Reveal password'}
              >
                {revealPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </div>

          <button
            onClick={() => setOtpResetOpen(true)}
            className="btn btn-outline btn-block"
          >
            <Lock />
            <span>Forgot Password? Reset via OTP</span>
          </button>
        </div>
      </div>
      </div>
      </div>

      {/* Password Verification Modal overlay */}
      {showPassVerifyModal && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4" style={{ background: 'rgba(5,4,3,0.82)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 380, margin: 'auto', padding: 28, position: 'relative' }}>
            <button
              onClick={() => { setShowPassVerifyModal(false); setPassVerifyError(''); }}
              className="icon-btn"
              style={{ position: 'absolute', top: 18, right: 18 }}
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex flex-col items-center mb-6" style={{ textAlign: 'center' }}>
              <div className="icon-badge maroon" style={{ marginBottom: 10 }}><Lock /></div>
              <h2 style={{ fontSize: 18 }}>Confirm your password</h2>
              <p style={{ color: 'var(--text-3)', fontSize: 12, fontWeight: 600, marginTop: 4 }}>Verify your identity to reveal saved credentials.</p>
            </div>

            <form onSubmit={handlePasswordVerificationSubmit}>
              {passVerifyError && (
                <div style={{ display: 'flex', gap: 8, background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.35)', padding: 10, borderRadius: 12, fontSize: 12, color: '#b91c1c', marginBottom: 16, fontWeight: 600 }}>
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{passVerifyError}</span>
                </div>
              )}

              <div className="reg-field">
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Lock /></div><b>Account Password <span className="req">*</span></b></div>
                <div className="input-wrap">
                  <input
                    type={showVerifyPass ? "text" : "password"} required value={passVerifyInput} onChange={(e) => setPassVerifyInput(e.target.value)}
                    placeholder="Enter password" style={{ paddingRight: 42 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowVerifyPass(!showVerifyPass)}
                    className="pwd-toggle-btn"
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}
                  >
                    {showVerifyPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => { setShowPassVerifyModal(false); setPassVerifyError(''); }} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
                <button type="submit" disabled={passVerifyLoading} className="btn btn-primary" style={{ flex: 2 }}>
                  {passVerifyLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* OTP Password Reset Modal inside Settings */}
      {otpResetOpen && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4" style={{ background: 'rgba(5,4,3,0.82)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 440, margin: 'auto', padding: 28 }}>
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><Lock /> Account Recovery</span>
                <h2 style={{ fontSize: 18 }}>Reset Account Password</h2>
              </div>
              <button onClick={() => setOtpResetOpen(false)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            {!otpResetSent ? (
              <div>
                <div className="store-tabs">
                  <button
                    type="button"
                    onClick={() => setOtpResetMethod('email')}
                    className={`store-tab ${otpResetMethod === 'email' || !otpResetMethod ? 'active' : ''}`}
                    style={{ flex: 1 }}
                  >
                    Email Recovery
                  </button>
                  <button
                    type="button"
                    onClick={() => setOtpResetMethod('phone')}
                    className={`store-tab ${otpResetMethod === 'phone' ? 'active' : ''}`}
                    style={{ flex: 1 }}
                  >
                    Phone Recovery
                  </button>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: otpResetMethod === 'phone' ? 'var(--teal)' : 'var(--blue)' }}>{otpResetMethod === 'phone' ? <Phone /> : <Mail />}</div><b>{otpResetMethod === 'phone' ? 'Registered Phone Number' : 'Registered Email Address'} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="text" required value={otpResetIdentifier} onChange={(e) => setOtpResetIdentifier(e.target.value)}
                      placeholder={otpResetMethod === 'phone' ? '+91 99999 99999' : 'owner@shop.com'}
                    />
                  </div>
                </div>
                <button
                  onClick={handleOtpResetSend}
                  className="btn btn-primary btn-block"
                >
                  <Mail />
                  <span>Send OTP Verification Code</span>
                </button>
              </div>
            ) : !otpResetVerified ? (
              <form onSubmit={handleOtpResetVerify}>
                <p style={{ color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, textAlign: 'center', lineHeight: 1.6, marginBottom: 14 }}>
                  A 4-digit code has been dispatched to <span style={{ color: 'var(--gold)', fontWeight: 800 }}>{otpResetIdentifier}</span>.
                </p>
                {otpResetDevCode && (
                  <div style={{ background: 'var(--card-2)', border: '1.5px dashed var(--gold)', borderRadius: 12, padding: '10px 14px', textAlign: 'center', marginBottom: 14 }}>
                    <p style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>
                      Testing mode &mdash; no {otpResetMethod === 'phone' ? 'SMS' : 'SMTP'} provider configured
                    </p>
                    <p style={{ fontSize: 20, color: 'var(--gold)', fontWeight: 800, letterSpacing: '.2em' }}>{otpResetDevCode}</p>
                  </div>
                )}
                <div className="field">
                  <label style={{ textAlign: 'center' }}>Enter OTP</label>
                  <input
                    type="text" required maxLength={4} value={otpResetOtpInput} onChange={(e) => setOtpResetOtpInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="1234"
                    style={{ width: '100%', background: 'var(--card-2)', border: '1.5px solid var(--border-2)', color: 'var(--text-0)', borderRadius: 13, padding: '13px 15px', fontSize: 16, textAlign: 'center', letterSpacing: '.3em', fontWeight: 800, outline: 'none' }}
                  />
                </div>
                {otpResetError && <div style={{ color: '#b91c1c', fontSize: 12, fontWeight: 600, marginBottom: 14 }}>{otpResetError}</div>}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setOtpResetSent(false)} className="btn btn-ghost" style={{ flex: 1 }}>Back</button>
                  <button type="submit" disabled={otpResetLoading} className="btn btn-primary" style={{ flex: 2 }}>
                    {otpResetLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Verify OTP'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleOtpResetSubmit}>
                {otpResetError && <div style={{ color: '#b91c1c', fontSize: 12, fontWeight: 600, marginBottom: 14 }}>{otpResetError}</div>}
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Lock /></div><b>New Password <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type={otpShowNewPass ? "text" : "password"} required value={otpResetNewPassword} onChange={(e) => setOtpResetNewPassword(e.target.value)}
                      placeholder="Min 6 characters" style={{ paddingRight: 42 }}
                    />
                    <button
                      type="button"
                      onClick={() => setOtpShowNewPass(!otpShowNewPass)}
                      className="pwd-toggle-btn"
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}
                    >
                      {otpShowNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><Lock /></div><b>Confirm Password <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type={otpShowConfirmPass ? "text" : "password"} required value={otpResetConfirmPassword} onChange={(e) => setOtpResetConfirmPassword(e.target.value)}
                      placeholder="Retype password" style={{ paddingRight: 42 }}
                    />
                    <button
                      type="button"
                      onClick={() => setOtpShowConfirmPass(!otpShowConfirmPass)}
                      className="pwd-toggle-btn"
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}
                    >
                      {otpShowConfirmPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit" disabled={otpResetLoading}
                  className="btn btn-primary btn-block"
                >
                  {otpResetLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Update Password'}
                </button>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}

// ============================================================================
// COMPONENT 14: REPORTS PORTAL VIEW
// ============================================================================
export function ReportsPortalView({ t, api }) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);
    
    setFromDate(thirtyDaysAgo.toISOString().split('T')[0]);
    setToDate(now.toISOString().split('T')[0]);
  }, []);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const custs = await api.getCustomers();
      const filtered = custs.filter(c => {
        const cDate = new Date(c.createdAt).getTime();
        const start = fromDate ? new Date(fromDate).getTime() : 0;
        const end = toDate ? new Date(toDate + 'T23:59:59').getTime() : Infinity;
        return cDate >= start && cDate <= end;
      });
      setReportData(filtered.map(c => ({
        'Customer Name': c.name,
        'Phone': c.phone,
        'Vehicle Number': c.vehicleNumber || 'N/A',
        'Key Blank Code': c.keyNumber,
        'Location Address': c.capturedAddress || 'N/A',
        'GPS Coordinates': `${c.latitude}, ${c.longitude}`,
        'Date Registered': new Date(c.createdAt).toLocaleString()
      })));
    } catch (err) {
      console.error(err);
      alert('Failed to generate report.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCSV = () => {
    if (reportData.length === 0) {
      alert('Please generate the report first.');
      return;
    }
    const headers = Object.keys(reportData[0]);
    const csvRows = [];
    csvRows.push(headers.join(','));

    for (const row of reportData) {
      const values = headers.map(header => {
        const escaped = ('' + row[header]).replace(/"/g, '\\"');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kee_report_${new Date().toISOString().split('T')[0]}.csv`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadTXT = () => {
    if (reportData.length === 0) {
      alert('Please generate the report first.');
      return;
    }
    const headers = Object.keys(reportData[0]);
    let txtContent = `========================================================================\n`;
    txtContent += `KEY SHOP SYSTEM TERMINAL - CUSTOMER REGISTRATION REPORT\n`;
    txtContent += `Generated: ${new Date().toLocaleString()}\n`;
    txtContent += `Range: ${fromDate || 'All Time'} to ${toDate || 'All Time'}\n`;
    txtContent += `========================================================================\n\n`;

    for (const row of reportData) {
      headers.forEach(header => {
        txtContent += `${header.padEnd(25)}: ${row[header]}\n`;
      });
      txtContent += `------------------------------------------------------------------------\n`;
    }

    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kee_report_${new Date().toISOString().split('T')[0]}.txt`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><BarChart3 /> Compliance &amp; Analytics</div>
          <h1>{t('reports')}</h1>
          <p>Generate dynamic CSV and plain-text customer registration reports for any date range.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'clamp(16px, 4vw, 24px)' }}>
        <div className="section-title" style={{ marginBottom: 18 }}>
          <h2>Report Builder</h2>
          <span className="sub">Select a date range, then generate the report</span>
        </div>

        <form onSubmit={handleGenerate}>
          <div className="reg-section">
            <div className="row2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="reg-field" style={{ marginBottom: 0 }}>
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Calendar /></div><b>From Date</b></div>
                <div className="input-wrap">
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </div>
              </div>
              <div className="reg-field" style={{ marginBottom: 0 }}>
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><CalendarRange /></div><b>To Date</b></div>
                <div className="input-wrap">
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ marginTop: 6 }}
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'Generating\u2026' : 'Generate Report'}</span>
          </button>
        </form>
      </div>

      {reportData.length > 0 && (
        <div className="animate-fade-in">
          <div className="stat-grid two">
            <div className="stat-card" style={{ animationDelay: '.05s' }}>
              <div className="stat-top">
                <div className="icon-badge purple"><FileText /></div>
                <span className="stat-trend"><TrendingUp />exported</span>
              </div>
              <div className="stat-num"><CountUp value={reportData.length} /></div>
              <div className="stat-label">Records in Report</div>
            </div>
            <div className="stat-card" style={{ animationDelay: '.15s' }}>
              <div className="stat-top">
                <div className="icon-badge blue"><Calendar /></div>
              </div>
              <div className="stat-num" style={{ fontSize: 18 }}>{fromDate || 'All time'} &rarr; {toDate || 'Today'}</div>
              <div className="stat-label">Date Range Covered</div>
            </div>
          </div>

          {/* Graphical Report Chart Visualization */}
          <div className="card chart-card" style={{ marginBottom: 24 }}>
            <div className="section-title">
              <h2>Visual Report Summary</h2>
              <span className="sub">Hover elements to view exact values</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Left Column: Bar Chart */}
              <div>
                <h4 className="bar-label" style={{ textAlign: 'center', marginBottom: 10, fontSize: 11 }}>
                  Registrations by Key Blank Reference
                </h4>
                <div className="bars">
                  {(() => {
                    const counts = {};
                    reportData.forEach(r => {
                      const key = r['Key Blank Code'] || 'N/A';
                      counts[key] = (counts[key] || 0) + 1;
                    });
                    const dataPoints = Object.keys(counts).map(key => ({ label: key, value: counts[key] })).slice(0, 8);

                    const maxVal = Math.max(...dataPoints.map(d => d.value), 1);

                    return dataPoints.map((d, idx) => {
                      const heightPercent = (d.value / maxVal) * 100;
                      return (
                        <div key={idx} className="bar-col group" style={{ position: 'relative' }}>
                          <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 4, height: '100%' }}>
                            <div
                              style={{ height: `${heightPercent}%`, maxWidth: 22 }}
                              className="bar relative"
                            >
                              <span
                                className="absolute opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ top: -20, left: '50%', transform: 'translateX(-50%)', fontSize: 9, fontWeight: 800, color: 'var(--gold-2)', whiteSpace: 'nowrap' }}
                              >
                                {d.value}
                              </span>
                            </div>
                          </div>
                          <div className="bar-label" style={{ marginTop: 8, width: '100%', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Right Column: Line Graph */}
              <div>
                <h4 className="bar-label" style={{ textAlign: 'center', marginBottom: 10, fontSize: 11 }}>
                  Registration Timeline Trend
                </h4>
                  <div className="h-48 w-full rounded-xl p-4 flex flex-col justify-between" style={{ background: 'var(--card-2)', border: '1px solid var(--border)' }}>
                    {(() => {
                      const dateCounts = {};
                      reportData.forEach(r => {
                        const rawDate = r['Date Registered'] || '';
                        const datePart = rawDate.split(' ')[0] || 'N/A';
                        dateCounts[datePart] = (dateCounts[datePart] || 0) + 1;
                      });
                      const sortedDates = Object.keys(dateCounts).sort((a, b) => new Date(a).getTime() - new Date(b).getTime()).slice(-10);
                      const dataPoints = sortedDates.map(date => ({ label: date, value: dateCounts[date] }));

                      if (dataPoints.length === 0) return <div className="text-center py-12" style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>No trend data</div>;

                      const maxVal = Math.max(...dataPoints.map(d => d.value), 1);
                      const width = 500;
                      const height = 150;
                      const padding = 20;

                      const coords = dataPoints.map((d, i) => {
                        const x = padding + (i / (dataPoints.length - 1 || 1)) * (width - 2 * padding);
                        const y = height - padding - (d.value / maxVal) * (height - 2 * padding);
                        return { x, y, label: d.label, val: d.value };
                      });

                      const pathD = coords.reduce((acc, c, i) => {
                        return i === 0 ? `M ${c.x} ${c.y}` : `${acc} L ${c.x} ${c.y}`;
                      }, '');

                      const areaD = coords.length > 0 
                        ? `${pathD} L ${coords[coords.length - 1].x} ${height - padding} L ${coords[0].x} ${height - padding} Z`
                        : '';

                      return (
                        <div className="w-full h-full flex flex-col justify-between">
                          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-28 overflow-visible">
                            <defs>
                              <linearGradient id="areaGradientReport" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#C89416" stopOpacity="0.4" />
                                <stop offset="100%" stopColor="#C89416" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>
                            
                            {/* Area under the line */}
                            {areaD && <path d={areaD} fill="url(#areaGradientReport)" className="chart-area-fade" />}

                            {/* Grid lines */}
                            <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                            <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />

                            {/* Trend Line */}
                            {pathD && <path d={pathD} fill="none" stroke="#7A1220" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="chart-line-draw" />}

                            {/* Interactive dots */}
                            {coords.map((c, i) => (
                              <g key={i} className="group cursor-pointer">
                                <circle cx={c.x} cy={c.y} r="4" fill="#7A1220" stroke="#ffffff" strokeWidth="1.5" className="chart-dot-pop" style={{ animationDelay: `${0.6 + i * 0.06}s` }} />
                                <text x={c.x} y={c.y - 8} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#1e1b2e" className="opacity-0 group-hover:opacity-100 transition-opacity">
                                  {c.val}
                                </text>
                              </g>
                            ))}
                          </svg>
                          <div className="flex justify-between px-1" style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                            {dataPoints.map((d, i) => (
                              <span key={i}>{d.label}</span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
              </div>

            </div>

            <div className="flex justify-between items-center" style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
              <span>Hover chart elements to view exact values</span>
            </div>
          </div>

          <div className="card table-card">
            <div className="table-head">
              <h2 style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 17 }}>
                Report Preview <span style={{ color: 'var(--text-3)', fontWeight: 700, fontSize: 13 }}>({reportData.length} records)</span>
              </h2>
              <div className="row-actions" style={{ gap: 10 }}>
                <button onClick={handleDownloadCSV} className="btn btn-outline btn-sm">
                  <Download />
                  <span>Export CSV</span>
                </button>
                <button onClick={handleDownloadTXT} className="btn btn-primary btn-sm">
                  <Download />
                  <span>Export TXT</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="kee-table">
                <thead>
                  <tr>
                    {Object.keys(reportData[0]).slice(0, 4).map(header => (
                      <th key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((row, idx) => {
                    const rowColors = ['purple', 'blue', 'pink', 'orange', 'teal', 'jgreen', 'skyblue', 'rose', 'maroon'];
                    const rowColor = rowColors[idx % rowColors.length];
                    return (
                      <tr key={idx}>
                        {Object.keys(row).slice(0, 4).map((header, hIdx) => (
                          hIdx === 0 ? (
                            <td key={header} className="cell-primary">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div className={`icon-badge ${rowColor}`} style={{ width: 34, height: 34, borderRadius: 10 }}>
                                  <User className="h-4 w-4" />
                                </div>
                                {row[header]}
                              </div>
                            </td>
                          ) : (
                            <td key={header}>{row[header]}</td>
                          )
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ padding: '14px 24px', fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>Showing up to first 4 columns in browser preview. Export to view all detailed data columns.</p>
          </div>
        </div>
      )}
    </div>
  );
}
