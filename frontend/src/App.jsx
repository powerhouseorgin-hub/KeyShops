import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { backHandlerStack, useBackHandler } from './utils/backHandler';
import { App as CapacitorApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { useAuth } from './context/AuthContext';
import { getAssetUrl, downloadAsset, filenameForAsset, API_BASE } from './apiConfig';
// buildCustomerReportPdf is loaded lazily (dynamic import) at each call site
// instead of a static top-level import - it pulls in jspdf + html2canvas,
// which are heavy and only ever needed when a report is actually generated,
// not on every page load. See the `await import('./utils/customerReportPdf')`
// calls below.
import { VEHICLE_CATEGORIES, isAutomobileCategory } from './utils/vehicleCategory';
import { normalizePhone } from './utils/phone';
import twoWheelerIcon from './assets/categories/two-wheeler.png';
import fourWheelerIcon from './assets/categories/four-wheeler.png';
import truckLorryIcon from './assets/categories/truck-lorry.png';
import homeCategoryIcon from './assets/categories/home.png';
import officeCategoryIcon from './assets/categories/office.png';
import addKeyIcon from './assets/addlostkeys/bluekey.png';
import lostKeyIcon from './assets/addlostkeys/redkey.png';
import { downloadPdf, sharePdf } from './utils/pdfDelivery';
import { openRazorpayCheckout } from './utils/razorpay';
import { ALL_TN_LOCATIONS } from './utils/tamilNaduLocations';
import { useLocationFilter } from './utils/locationFilter';
import { categoryImage } from './utils/categoryIcon';
import PublicSite from './components/PublicSite';
import PublicMobileApp, { PublicBottomNav } from './components/PublicMobileApp';
import CustomSelect from './components/CustomSelect';
import PriceTag from './components/PriceTag';
// Lazy-loaded: pulls in the Capacitor Firebase Authentication SDK, which
// anonymous pre-login visitors (Home/Search/About/Contact) never need until
// they actually tap Login - a static import here would ship that weight in
// the main bundle for every visitor regardless. Every usage site below is
// already gated behind the login-shell or the authenticated dashboard, so
// pre-login browsing never triggers this chunk's fetch at all.
const OtpVerificationModal = lazy(() => import('./components/OtpVerificationModal'));
import ImageCarousel from './components/ImageCarousel';
import {
  Key, Users, Radio, BarChart3, Database, LogOut, Check, X,
  Plus, Settings, FileText, Search, Filter, UserCheck, MapPin, Camera, AlertTriangle,
  Trash, RefreshCw, Layers, Edit, ExternalLink, Sliders, DollarSign,
  Bell, Eye, EyeOff, CheckCircle2, ChevronRight,
  CreditCard, QrCode, Lock, ShieldCheck, Upload, Mail, Phone,
  ArrowRight, ArrowLeft, Building2, Calendar,
  Store, TrendingUp, UserPlus, Clock, IndianRupee,
  Sparkles,
  User, Hash, UploadCloud, Crosshair, FileCheck, Navigation, KeyRound, Car,
  Tag, Package, Boxes, Percent, Image as ImageIcon, Megaphone, BadgePercent,
  Receipt, CalendarRange, Banknote, PlayCircle, MessageCircle, LifeBuoy,
  Download, Fingerprint, Menu, Home, Languages, Globe,
  Wrench, Cpu, Gauge, ScanLine, Headset, Share2, Copy, Save, Award, Link2,
  GripVertical, Smartphone
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
import dealerIcon from './assets/dashboard-icons/dealer.png';
import keyShopLogo from './assets/branding/keyshop-logo.png';

const ALL_DOC_TYPES = [
  'Aadhaar Card',
  'Driving License',
  'RC Book',
  'Passport',
  'Voter ID',
  'PAN Card',
  'Additional Document'
];

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

// Resizes an image File/Blob down to at most maxDim on its longer side and
// re-encodes it as a JPEG Blob at the given quality - used before uploading
// a Machines listing photo or banner ad image (see uploadPromotionImage/
// uploadAdImage), so a full-resolution phone camera photo (often several MB)
// doesn't get uploaded as-is. This is a real upload (multipart to file
// storage), not base64 embedding - see the "why is Used Machines slow"
// investigation for what happens when a raw photo gets base64-encoded
// straight into a database column instead.
const resizeImageFileToBlob = (file, maxDim = 1200, quality = 0.82) => new Promise((resolve, reject) => {
  const img = new Image();
  const objectUrl = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(objectUrl);
    let { width, height } = img;
    if (width > height) {
      if (width > maxDim) { height *= maxDim / width; width = maxDim; }
    } else {
      if (height > maxDim) { width *= maxDim / height; height = maxDim; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not process image'));
    }, 'image/jpeg', quality);
  };
  img.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error('Could not read image file'));
  };
  img.src = objectUrl;
});


// True only when running inside the native Android/iOS shell (Capacitor),
// never in a regular desktop/mobile browser. Used to skip the marketing
// landing page (PublicSite) for the packaged app and drop straight into the
// login screen, since a native app has no reason to show a browsable
// marketing site before sign-in.
const IS_NATIVE_APP = Capacitor.isNativePlatform();

// Public landing page shared in referral invites (see the header Refer
// button and the Shop Settings referral card) - the same domain already
// used for the subscription payment QR code below. Must be the real deployed
// Firebase Hosting URL (not a placeholder) since recipients actually need to
// be able to open it.
const KEE_LANDING_PAGE_URL = 'https://keyshops.in';

// Web-only URL <-> publicPage mapping (see the `publicPage` state below) so
// PublicSite's Home/Search/About/Contact tabs become real, distinct,
// crawlable URLs instead of one URL with client-only state - previously
// Google could only ever discover a single page for the entire public site.
// Native app never uses this (it has no address bar and PublicMobileApp
// manages its own internal tab state instead), so every reference to this
// map is scoped to the `!IS_NATIVE_APP` code paths.
const PUBLIC_PATH_BY_PAGE = { home: '/', search: '/search', about: '/about', contact: '/contact', login: '/login' };
const PUBLIC_PAGE_BY_PATH = { '/': 'home', '/search': 'search', '/about': 'about', '/contact': 'contact', '/login': 'login' };

const TERMS_AND_CONDITIONS_TITLE = 'Terms and Conditions';
const TERMS_AND_CONDITIONS_BODY = `By creating an account and using this application, you agree to the following:

1. I understand that the server or mobile application may occasionally be slow or unavailable, and I will wait until the service is restored.
2. If I encounter any server errors, application issues, or temporary service interruptions, I understand that they will be resolved as soon as possible and will wait patiently.
3. I will keep all customer information, including photos, personal details, and documents, confidential and will not share them with any unauthorized person or third party.
4. I will use this application only for its intended purpose of managing and storing customer and business information. I will not misuse the application for any illegal, fraudulent, or unauthorized activities.
5. I understand that misuse of the application or violation of these terms may result in suspension or permanent termination of my account without prior notice.
6. Subscription fees are non-refundable. Once a subscription has been purchased, I will not request a refund or transfer the subscription to another person or account.
7. I agree to comply with all applicable laws, regulations, and these Terms and Conditions while using the application.
8. By proceeding with registration, I confirm that I have read, understood, and agree to these Terms and Conditions.`;

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
// A failure here can genuinely be either cause (denied permission vs GPS/
// Location Services switched off) - the OS/browser doesn't always report
// which one clearly, and guessing wrong sends the user to fix the wrong
// setting. So every message mentions BOTH requirements together instead of
// picking one; `kind` is kept distinct only to drive which follow-up
// shortcut button is most likely to help (e.g. "Open App Settings" for a
// permission denial).
const LOCATION_TROUBLESHOOT_MSG = "Couldn't get your current location. Please make sure location permission is allowed for this app AND that your device's Location Services (GPS) is turned on, then try again.";

function classifyLocationError(e) {
  const msg = ((e && e.message) || '').toLowerCase();
  if ((e && e.code === 1) || msg.includes('permission') || msg.includes('denied')) {
    const err = new Error(LOCATION_TROUBLESHOOT_MSG);
    err.kind = 'permission';
    return err;
  }
  if (msg.includes('not enabled') || msg.includes('disabled') || msg.includes('location services') || msg.includes('turned off')) {
    const err = new Error(LOCATION_TROUBLESHOOT_MSG);
    err.kind = 'disabled';
    return err;
  }
  const err = new Error(LOCATION_TROUBLESHOOT_MSG);
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
        const err = new Error(LOCATION_TROUBLESHOOT_MSG);
        err.kind = 'permission';
        throw err;
      }
    }
    if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
      const err = new Error(LOCATION_TROUBLESHOOT_MSG);
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
        Geolocation.clearWatch({ id: watchId }).catch(() => { });
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

// Full-screen App Poster (AdType.APP_POSTER) - see App()'s appStateChange
// effect below. Rendered above everything (auth or not), so it's a plain
// standalone overlay rather than something tucked inside the authenticated
// dashboard or PublicMobileApp's own screen stack.
function AppPosterOverlay({ ad, onClose }) {
  return (
    <div className="app-poster-overlay">
      <button type="button" className="app-poster-close" onClick={onClose} aria-label="Close"><X /></button>
      <div className="app-poster-media">
        {ad.imageUrl && <img src={ad.imageUrl} alt={ad.title || ''} />}
      </div>
    </div>
  );
}

// Guards the GPS-default-location resolution (see App()'s effect below) so
// it only ever runs once per app session, never re-attempted on re-render.
let gpsDefaultLocationAttempted = false;

// The six-language translation dictionary lives in its own ~5,000-line
// module (src/i18n/translations.js) and is fetched as a separate chunk
// instead of being statically bundled here - PublicSite (anonymous web
// marketing visitors) and PublicMobileApp (anonymous native pre-login
// browsing) never call t() at all, so they shouldn't have to download it.
// Kicked off here at module scope, the moment App.jsx itself loads, rather
// than inside an effect, so it starts as early as physically possible and
// is very likely already resolved by the time a real user reaches anything
// that needs it (the login overlay, or an already-authenticated session's
// dashboard).
const translationsPromise = import('./i18n/translations');

// Shown in place of any t()-dependent UI (the login/OTP/registration
// overlay, or the authenticated dashboard) for the brief window - typically
// well under a second - after translationsPromise is still pending. Mirrors
// the boot screen below with no text of its own, since text at this point
// would need t() before it's available.
function TranslationsLoadingFallback() {
  return (
    <div className="flex h-screen items-center justify-center" style={{ background: '#ffffff' }}>
      <div className="flex flex-col items-center gap-5 animate-fade-in">
        <div className="brand">
          <img src={keyShopLogo} alt="Key Shop" className="brand-logo-lg" style={{ height: 120, width: 'auto' }} />
        </div>
        <div className="brand-loading-track"><div className="brand-loading-fill" /></div>
      </div>
    </div>
  );
}

export default function App() {
  const { user, isAuthenticated, loading, login, logout, api } = useAuth();
  const [lang, setLang] = useState(localStorage.getItem('kee_lang') || 'en');
  const [langData, setLangData] = useState(null);
  useEffect(() => {
    translationsPromise.then((m) => setLangData(m.default));
  }, []);
  const t = (key) => langData?.[lang]?.[key] || langData?.['en']?.[key] || key;

  // capacitor.config.json sets SplashScreen.launchAutoHide: false, so the
  // native splash (logo on white, see styles.xml) stays on screen until this
  // fires - without it, Android's default behavior dismisses the splash as
  // soon as the WebView has ANY content attached (often a blank frame,
  // before React has mounted), producing a "logo, then blank, then logo
  // again" flash on cold start. This effect runs after the very first
  // render commits - since the branded loading screen below (logo + red
  // bar) is what App() always paints first (loading starts true), the
  // native splash hands off directly to an already-painted, visually
  // identical screen instead of a gap.
  useEffect(() => {
    if (IS_NATIVE_APP) SplashScreen.hide();
  }, []);

  // App Poster (AdType.APP_POSTER) - a full-screen promo shown exactly once
  // per app session, on the initial launch only, regardless of login state
  // (unlike the shop-admin-only "Interactive Login Popup" type). Fetched
  // once in this mount-only effect ([] deps, and App() itself never
  // remounts during the session) - deliberately NOT re-fetched on
  // `appStateChange`/foreground-resume anymore: that used to re-show the
  // poster after any OS-level focus loss (backgrounding to use the camera
  // for document capture, the phone dialer/WhatsApp from a tap-to-call
  // button, SMS-autofill for OTP, etc.), which looked like the poster
  // randomly reappearing mid-registration or mid-OTP-verification. A
  // "session" here means one continuous app process from launch to being
  // fully killed - relaunching starts a fresh session and shows it again.
  const [appPoster, setAppPoster] = useState(null);
  useEffect(() => {
    if (!IS_NATIVE_APP) return;
    api.getPublicAppPoster().then((ad) => setAppPoster(ad || null)).catch(() => {});
  }, []);

  // GPS-based default location for the Key Shops/ECM/Meter/Scanning
  // (CategoryShopsView) and Used Machines (PromotionsFeed) location
  // dropdowns - resolved once per app session (mount-only effect, guarded
  // by the module-level flag below so it's never re-attempted on
  // navigation/re-render, honoring "don't repeatedly request location
  // permission"). On any failure (permission denied, GPS/Location Services
  // off, timeout, no reverse-geocode match) this silently stays '' - every
  // consumer already treats '' as "All Locations", so there's no separate
  // error path to show the user and nothing is ever blocked.
  const [defaultLocation, setDefaultLocation] = useState('');
  // Flips true exactly once, when the GPS-default resolution attempt below
  // finishes - success, failure, or "no match" all count as "we now know the
  // location status." Every Shops/Products screen (CategoryShopsView,
  // DealersView, ShopsManagementView, PromotionsFeed, PublicMobileApp's
  // Shops/Machines tabs) gates its very first data fetch on this instead of
  // fetching immediately with an unresolved '' town: without it, a screen
  // would show all-location results the instant it mounts, then silently
  // re-fetch and swap to location-filtered results once GPS/reverse-geocode
  // finishes a few seconds later - a flicker between two different result
  // sets. Gating on this instead means each screen's skeleton loader simply
  // stays up until the location status (and, if available, the matching
  // fetch) is fully resolved, then renders the correct result set once.
  const [locationReady, setLocationReady] = useState(false);
  useEffect(() => {
    // Wait until AuthContext's own mount effect has restored (or ruled out)
    // a saved session - `isAuthenticated` is unreliably `false` before that,
    // since AuthProvider wraps App and child effects fire before parent
    // effects. Deciding the skip/proceed branch below on a still-loading
    // auth state would incorrectly skip GPS for an actually-authenticated
    // Super Admin web user on every page reload.
    if (loading) return;

    // defaultLocation/locationReady are only ever consumed by PublicMobileApp
    // (native, pre-login) and the authenticated Shops/Products dashboard
    // views (native Shop Admin or web Super Admin) - never by the anonymous
    // web marketing site (PublicSite). Requesting GPS there was pure waste
    // and, worse, popped an unsolicited browser location-permission prompt
    // for visitors just browsing Home/About/Contact who never asked for it.
    if (!IS_NATIVE_APP && !isAuthenticated) {
      setLocationReady(true);
      return;
    }

    if (gpsDefaultLocationAttempted) {
      // Only reachable in dev (React StrictMode's mount/unmount/remount) or
      // HMR - a previous instance already resolved (or is resolving) this
      // same app session, and there's no way to recover that result into
      // this fresh instance. Unblock rendering immediately instead of
      // leaving every Shops/Products screen stuck on its skeleton forever.
      setLocationReady(true);
      return;
    }
    gpsDefaultLocationAttempted = true;
    (async () => {
      try {
        const { lat, lng } = await resolveCurrentLocation();
        const geo = await reverseGeocode(lat, lng);
        if (!geo) return;
        // `city` is the finer town-level granularity, `district` the
        // coarser fallback - matched against the same canonical
        // ALL_TN_LOCATIONS list the dropdowns themselves are built from, so
        // whatever this resolves to is guaranteed to be a valid, selectable
        // option.
        const candidates = [geo.city, geo.district].filter(Boolean);
        const match = candidates
          .map((c) => ALL_TN_LOCATIONS.find((loc) => loc.toLowerCase() === c.toLowerCase()))
          .find(Boolean);
        if (match) setDefaultLocation(match);
      } catch (e) {
        // Permission denied / GPS disabled / timeout - fall through to the
        // '' default (All Locations) already set above.
      } finally {
        setLocationReady(true);
      }
    })();
  }, [loading, isAuthenticated]);

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
      listenerHandle.then((l) => l.remove()).catch(() => { });
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
      .catch(() => { });
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
          await Geolocation.requestPermissions().catch(() => { });
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

  // `searchDispatch` ({query, type, nonce}) is a hand-off used by the
  // Dashboard's category cards to jump into another tab pre-filtered to a
  // specific query (see goToProductType/goToAddMachines in DashboardView) -
  // still needed even though the header's own global search box (which used
  // to set this from typed input) has been removed.
  const [searchDispatch, setSearchDispatch] = useState(null);

  const PAGE_TITLES = {
    dashboard: t('dashboard'),
    shops: t('shops'),
    dealers: t('dealersPageTitle') || t('dealers'),
    'key-shops': t('keyShops'),
    ecm: t('ecm'),
    meter: t('meter'),
    scanning: t('scanning'),
    'super-customers': t('customers'),
    keys: t('keys'),
    revenue: t('revenue'),
    'support-config': t('supportConfig'),
    promotions: t('inventory'),
    'search-keys': t('searchKeys'),
    register: t('register'),
    history: t('history'),
    reports: t('reports'),
    'customer-care': t('customerCare'),
    'support-contact': t('supportContactTitle'),
    settings: t('settings'),
  };

  // The header no longer shows the page title as text (replaced by the global
  // search panel below), but the browser tab title still reflects it.
  useEffect(() => {
    document.title = PAGE_TITLES[activeTab] ? `${PAGE_TITLES[activeTab]} | Key Shop` : 'Key Shop';
  }, [activeTab, lang]);

  // Public (unauthenticated) page state, shared by both the web marketing
  // site (PublicSite: home | search | about | contact | login) and the
  // native app's public mobile browsing experience (PublicMobileApp - only
  // cares about the 'login' vs "anything else" distinction, since it owns
  // its own internal Home/Shops/Machines/My Ads tab state). Anonymous
  // visitors land on 'home' either way; tapping Login switches this to
  // 'login', which renders the existing, unmodified login-shell UI below.
  const [publicPage, setPublicPage] = useState(() => {
    if (IS_NATIVE_APP || typeof window === 'undefined') return 'home';
    return PUBLIC_PAGE_BY_PATH[window.location.pathname] || 'home';
  });
  // Web-only: pushes a real URL alongside the state change (native call
  // sites keep using the plain setPublicPage setter above, since the native
  // app has no address bar to reflect). Passed as PublicSite's `onNavigate`.
  const navigatePublicPage = (next) => {
    setPublicPage(next);
    if (typeof window === 'undefined') return;
    const path = PUBLIC_PATH_BY_PAGE[next] || '/';
    if (window.location.pathname !== path) {
      window.history.pushState({ publicPage: next }, '', path);
    }
  };
  // Keeps `publicPage` in sync with browser Back/Forward navigation.
  useEffect(() => {
    if (IS_NATIVE_APP || typeof window === 'undefined') return;
    const onPopState = () => setPublicPage(PUBLIC_PAGE_BY_PATH[window.location.pathname] || 'home');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  // Which PublicMobileApp tab to land on when native returns from the login
  // screen to browsing - set right before switching publicPage back, e.g. by
  // the login screen's own bottom nav (see the login-shell render branch).
  const [publicInitialTab, setPublicInitialTab] = useState('home');

  // Native app's login is an overlay dialog on top of PublicMobileApp (not a
  // full-page navigation) - hardware Back should just close it back to
  // whichever public tab was showing underneath, same as tapping the
  // backdrop. Registers on the same shared backHandlerStack every other
  // modal in the app uses, so it's popped before any tab-level back handling
  // inside the still-mounted PublicMobileApp underneath.
  useBackHandler(IS_NATIVE_APP && publicPage === 'login', () => setPublicPage('home'));

  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  // Shown only if login is still pending after a few seconds - the backend
  // host spins down after ~15 min idle, and the first request after that
  // pays a real 30-70s cold-start penalty (unrelated to any app bug). A
  // bare spinner for that long reads as broken; this reassures the user
  // it's just waking up.
  const [authSlowNotice, setAuthSlowNotice] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  // Header "Refer" action - Shop Admin only (Super Admin has no shop of its
  // own, so there's nothing to attach a referral code to). Reuses the same
  // idempotent generate-or-fetch endpoint as the Shop Settings referral card.
  const [headerReferralSharing, setHeaderReferralSharing] = useState(false);
  const handleHeaderReferShare = async () => {
    if (headerReferralSharing) return;
    setHeaderReferralSharing(true);
    try {
      const { referralCode } = await api.generateReferralCode();
      const message = t('referralShareMessageTemplate').replace('{code}', referralCode).replace('{url}', KEE_LANDING_PAGE_URL);
      if (Capacitor.isNativePlatform()) {
        const { Share } = await import('@capacitor/share');
        await Share.share({ text: message });
      } else if (navigator.share) {
        await navigator.share({ text: message });
      } else {
        await navigator.clipboard.writeText(message);
        alert(t('referralMessageCopiedMsg'));
      }
    } catch (err) {
      alert(err.message || t('failedGenerateReferralCodeMsg'));
    } finally {
      setHeaderReferralSharing(false);
    }
  };
  const [autoOpenShopModal, setAutoOpenShopModal] = useState(false);
  const [autoOpenListingModal, setAutoOpenListingModal] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showLangDialog, setShowLangDialog] = useState(false);
  const [downloadToastVisible, setDownloadToastVisible] = useState(false);
  const langDialogCardRef = useRef(null);

  useEffect(() => {
    const handleDocDownloaded = () => {
      setDownloadToastVisible(true);
      setTimeout(() => setDownloadToastVisible(false), 3000);
    };
    window.addEventListener('document_downloaded', handleDocDownloaded);
    return () => window.removeEventListener('document_downloaded', handleDocDownloaded);
  }, []);

  // Auto-download customer report PDF when opening deep link e.g. ?downloadDoc=... or ?action=download_doc&...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const downloadDocId = params.get('downloadDoc');

    if (downloadDocId || action === 'download_doc') {
      const id = downloadDocId || params.get('id');
      const name = params.get('name') || 'Customer';
      const phone = params.get('phone') || 'N/A';
      const keyNumber = params.get('keyNumber') || '';
      const address = params.get('address') || '';
      const vehicleNumber = params.get('vehicleNumber') || '';
      const billAmount = params.get('billAmount') || '';
      const shopName = params.get('shopName') || 'Key Shops';
      const vehicleCategory = params.get('vehicleCategory') || '';

      (async () => {
        try {
          let customerData = null;
          let shopData = { name: shopName, address: 'N/A', phone: 'N/A' };

          if (id && api && api.getSuperCustomers) {
            try {
              const custs = await api.getSuperCustomers(id).catch(() => null);
              if (custs) {
                customerData = Array.isArray(custs) ? custs.find(c => c.id === id) || custs[0] : custs;
              }
            } catch (e) {}
          }

            <div className="reg-section">
              <div className="grid grid-cols-2 gap-4">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Phone /></div><b>{t('phoneContactLabel')}</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{viewCust.phone || 'N/A'}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Calendar /></div><b>{t('registryDateLabel')}</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{new Date(viewCust.createdAt).toLocaleString()}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><Home /></div><b>{t('addressLabel')}</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }} className="block truncate">{viewCust.address || viewCust.capturedAddress || 'N/A'}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><KeyRound /></div><b>{t('keyBlankCodeLabel')}</b></div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="badge badge-active"><span className="dot" />{viewCust.keyNumber || viewCust.keyCode || 'N/A'}</span>
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Car /></div><b>Vehicle / Key Type</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gold)' }}>{viewCust.vehicleCategory || viewCust.lockCategory || viewCust.keyType || 'N/A'}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Tag /></div><b>Key / Vehicle Name</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{viewCust.vehicleName || viewCust.homeOfficeName || 'N/A'}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><CheckCircle2 /></div><b>Add Key / Lost Key</b></div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${viewCust.addKey ? 'badge-active' : 'badge-suspended'}`}>Add: {viewCust.addKey ? 'Yes' : 'No'}</span>
                    <span className={`badge ${viewCust.lostKey ? 'badge-active' : 'badge-suspended'}`}>Lost: {viewCust.lostKey ? 'Yes' : 'No'}</span>
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--gold)' }}><DollarSign /></div><b>Bill ID & Amount</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--gold)' }}>
                    {viewCust.billNumber || viewCust.billId || 'N/A'} {viewCust.billAmount != null && viewCust.billAmount !== '' ? `(₹${Number(viewCust.billAmount).toFixed(2)})` : '(N/A)'}
                  </span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Fingerprint /></div><b>{t('idVerificationLabel')}</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{viewCust.idProofType || viewCust.idType || 'N/A'}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><Lock /></div><b>{t('idNumberDecryptedLabel')}</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gold)' }}>{viewCust.idProofNumber || viewCust.idNumber || 'N/A'}</span>
                </div>
              </div>
            </div>

          if (!customerData) {
            customerData = {
              name,
              phone,
              keyNumber,
              vehicleNumber,
              capturedAddress: address,
              address,
              billAmount: billAmount ? Number(billAmount) : null,
              vehicleCategory,
              createdAt: new Date().toISOString(),
            };
          }

          const { buildCustomerReportPdf } = await import('./utils/customerReportPdf');
          const pdf = await buildCustomerReportPdf({
            customer: customerData,
            shop: customerData.shop || shopData,
            registeredByName: customerData.registeredByName || shopName,
          });
          const safeName = `${name.trim().replace(/[^a-zA-Z0-9_\-\s]+/g, '').replace(/\s+/g, '_')}.pdf`;
          await downloadPdf(pdf, safeName);
        } catch (err) {
          console.error('Failed auto-download of customer document:', err);
        }
      })();
    }
  }, []);

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
  const [otpVerified, setOtpVerified] = useState(false);
  const [showResetOtpModal, setShowResetOtpModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  // Shop Self-Registration states - two-step wizard: Step 1 collects the
  // shop/owner details shown in the public registration screenshot (name,
  // shop name, address+GPS, city, state, PIN code, optional Aadhaar number,
  // OTP-verified mobile number); Step 2 collects password, subscription
  // plan and payment before submitting.
  const [showRegisterShop, setShowRegisterShop] = useState(false);
  const [regShopName, setRegShopName] = useState('');
  const [regOwnerName, setRegOwnerName] = useState('');
  // Optional shop email, gated behind an ON/OFF toggle that defaults OFF -
  // same pattern as regWebsiteUrlEnabled below (the field is only rendered,
  // and only sent to the backend, when enabled).
  const [regEmailEnabled, setRegEmailEnabled] = useState(false);
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPhoneError, setRegPhoneError] = useState('');
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
  // Town/city-level locality (e.g. "Gopichettipalayam"), auto-filled from
  // Nominatim's `city` field (see geo.controller.ts) alongside regCity above
  // - despite its name, regCity actually holds the district (state_district),
  // so this is a separate, real town-level value sent to the backend as
  // RegisterShopDto.town, powering the public Shops/Machines town filter.
  const [regTown, setRegTown] = useState('');
  const [regState, setRegState] = useState('');
  const [regPinCode, setRegPinCode] = useState('');
  const [regAadhaarNumber, setRegAadhaarNumber] = useState('');
  // Optional shop website, gated behind an ON/OFF toggle that defaults OFF -
  // the field itself is only rendered (and only sent to the backend) when
  // enabled, see RegisterShopDto.website in auth.dto.ts.
  const [regWebsiteUrlEnabled, setRegWebsiteUrlEnabled] = useState(false);
  const [regWebsiteUrl, setRegWebsiteUrl] = useState('');
  // Optional code entered by the new shop owner, validated server-side against
  // another shop's Shop.referralCode (see ShopService.getOrCreateReferralCode).
  const [regReferralCode, setRegReferralCode] = useState('');
  const [regTermsAccepted, setRegTermsAccepted] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  // Shop "type" dropdown, populated from the Super-Admin-curated list (see
  // ShopCategoriesView) via the public GET /api/shop-categories endpoint -
  // fetched once the registration dialog opens (see useEffect below).
  const [regCategoryId, setRegCategoryId] = useState('');
  const [regCategories, setRegCategories] = useState([]);
  const [regCategoriesLoading, setRegCategoriesLoading] = useState(false);
  const [regPassword, setRegPassword] = useState('');
  // Single yearly plan platform-wide - price is Super Admin-configurable
  // (see SupportConfigView / PlatformConfig.subscriptionPrice).
  const [regSubscriptionPrice, setRegSubscriptionPrice] = useState(999);
  const [regGstPercent, setRegGstPercent] = useState(18);
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

  // Mobile OTP verification - Step 1's Mobile Number field triggers the
  // shared OtpVerificationModal (phone-only - there's no email to verify
  // against here since email is optional and unverified).
  const [regOtpVerified, setRegOtpVerified] = useState(false);
  const [showRegOtpModal, setShowRegOtpModal] = useState(false);

  // Self-Registration Payment state - Step 2 opens the real Razorpay
  // Checkout widget (which offers card/UPI/netbanking/wallet on its own),
  // so there's no in-app payment-method form to hold state for anymore.
  const [regPayProcessing, setRegPayProcessing] = useState(false);

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

  // Single platform-wide yearly subscription price, Super Admin-configurable
  // (see SupportConfigView) - also public/pre-login since it's needed here.
  useEffect(() => {
    if (!showRegisterShop) return;
    api.getSupportConfig()
      .then((cfg) => {
        setRegSubscriptionPrice(cfg.subscriptionPrice ?? 999);
        setRegGstPercent(cfg.gstPercent ?? 18);
      })
      .catch((e) => console.error('Failed to load subscription price:', e));
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
    setAuthSlowNotice(false);
    const slowTimer = setTimeout(() => setAuthSlowNotice(true), 4000);
    try {
      await login(authEmail, authPassword);
      resetToDashboard();
    } catch (err) {
      setAuthError(err.message || t('loginFailedCheckCredentialsMsg'));
    } finally {
      clearTimeout(slowTimer);
      setAuthSlowNotice(false);
      setAuthLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    setResetError('');
    if (newPassword !== confirmPassword) {
      setResetError(t('passwordsDoNotMatchMsg'));
      return;
    }
    setResetLoading(true);
    try {
      await api.resetPasswordPublic(resetIdentifier, resetMethod, newPassword);
      setResetSuccess(true);
    } catch (err) {
      setResetError(err.message || t('passwordResetFailedMsg'));
    } finally {
      setResetLoading(false);
    }
  };

  const resetForgotPasswordFlow = () => {
    setShowForgotPassword(false);
    setResetMethod(null);
    setResetIdentifier('');
    setOtpVerified(false);
    setShowResetOtpModal(false);
    setNewPassword('');
    setConfirmPassword('');
    setResetError('');
    setResetSuccess(false);
  };

  // Inline mobile OTP verification trigger for Step 1 - phone-only, no email
  // option. Actual send/verify/resend/countdown lives in the shared
  // OtpVerificationModal (see showRegOtpModal below).
  // Always opens the popup - phone-format validation happens inside the
  // modal itself (see OtpVerificationModal's sendCode), so a bad number
  // shows an inline error in the dialog instead of a blocking alert() that
  // prevents the popup from ever appearing.
  const handleOpenRegOtpModal = () => {
    const normalized = normalizePhone(regPhone);
    if (!normalized) {
      setRegPhoneError(PHONE_REGEX_MESSAGE);
      return;
    }
    setRegPhoneError('');
    if (normalized !== regPhone) setRegPhone(normalized);
    setShowRegOtpModal(true);
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
      // Complete Shop Address field shows the full formatted address (same
      // pattern as the Customer Registration wizard's captureCustomerLocation)
      // rather than just street+locality, since City/State/PIN Code are no
      // longer separate visible fields - this is the only address text the
      // owner sees and can edit.
      const fullAddress = data.displayName || [data.street, data.locality].filter(Boolean).join(', ');
      setRegLocation(fullAddress || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      if (data.district) setRegCity(data.district);
      if (data.city) setRegTown(data.city);
      if (data.state) setRegState(data.state);
      if (data.postcode) setRegPinCode(data.postcode.replace(/\D/g, ''));
      setRegLocLoading(false);
      return;
    }
    setRegLocation(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    setRegLocLoading(false);
  };

  const handleRegCheckout = async (e) => {
    e.preventDefault();
    setRegError('');
    setRegPayProcessing(true);

    // Order is created server-side for the platform's real subscription
    // price (the client never sends an amount) - see PaymentService.createSubscriptionOrder.
    let order;
    try {
      order = await api.createPaymentOrder();
    } catch (err) {
      setRegPayProcessing(false);
      setRegError(err.message || t('failedInitCheckout'));
      return;
    }

    // Hand off to Razorpay's own Checkout modal (card/UPI/netbanking/wallet
    // all built in) - drop our own "processing" overlay while it's open so
    // the two don't visually stack.
    setRegPayProcessing(false);

    openRazorpayCheckout({
      order,
      prefill: {
        name: regOwnerName,
        contact: regPhone,
        ...(regEmailEnabled && regEmail ? { email: regEmail.trim() } : {}),
      },
      description: `${regShopName} - Yearly Subscription`,
      onSuccess: async (response) => {
        setRegPayProcessing(true);
        try {
          const res = await api.registerShop({
            shopName: regShopName,
            ownerName: regOwnerName,
            categoryId: regCategoryId,
            email: regEmailEnabled && regEmail ? regEmail.trim() : undefined,
            phone: regPhone,
            location: regLocation,
            city: regCity,
            town: regTown,
            state: regState,
            pinCode: regPinCode,
            aadhaarNumber: regAadhaarNumber || undefined,
            website: regWebsiteUrlEnabled && regWebsiteUrl ? regWebsiteUrl.trim() : undefined,
            referralCode: regReferralCode || undefined,
            password: regPassword,
            latitude: regLat ?? undefined,
            longitude: regLng ?? undefined,
            // Verified server-side (HMAC against the key secret) before the
            // shop account is created - see AuthService.registerShop.
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });

          setRegPayProcessing(false);
          setRegLoginEmail(res.loginEmail || '');
          setRegSuccessMessage(res.message || t('registrationSuccessfulShopActiveMsg'));
        } catch (err) {
          setRegPayProcessing(false);
          setRegError(err.message || t('selfRegistrationFailedMsg'));
        }
      },
      // User closed the Razorpay modal without paying - just stop showing
      // "processing"; no shop account was touched, they can hit Pay again.
      onDismiss: () => setRegPayProcessing(false),
      onError: (err) => {
        setRegPayProcessing(false);
        setRegError(err.message);
      },
    });
  };

  // Shared by both close and (re)open - the dialog's own useState lives in
  // this persistently-mounted parent (it's an overlay toggled by a boolean,
  // not a separate tab that unmounts), so leaving via any path that isn't
  // the X button (e.g. Android hardware back) previously left regOtpVerified
  // stuck true - relocking the disabled phone field - on the next open.
  const clearRegisterShopFields = () => {
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
    setRegWebsiteUrlEnabled(false);
    setRegWebsiteUrl('');
    setRegCategoryId('');
    setRegPassword('');
    setRegError('');
    setRegSuccessMessage('');
    setRegLoginEmail('');
    setRegOtpVerified(false);
    setShowRegOtpModal(false);
    setRegPayProcessing(false);
    setRegStep(1);
  };

  const resetRegisterShopFlow = () => {
    setShowRegisterShop(false);
    clearRegisterShopFields();
  };

  const openRegisterShopFlow = () => {
    clearRegisterShopFields();
    setShowRegisterShop(true);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: '#ffffff' }}>
        <div className="flex flex-col items-center gap-5 animate-fade-in">
          <div className="brand">
            <img src={keyShopLogo} alt="Key Shop" className="brand-logo-lg" style={{ height: 120, width: 'auto' }} />
          </div>
          <div className="brand-loading-track"><div className="brand-loading-fill" /></div>
          {/* Shown before we've restored the saved session, i.e. before we
              even know what to fetch translations for - hardcoded rather
              than t()-driven so it can't ever render a raw i18n key while
              the (separately chunked, see translationsPromise) dictionary
              is still in flight. */}
          <p style={{ color: 'var(--text-3)' }} className="text-sm font-semibold">Bootstrapping your workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {appPoster && <AppPosterOverlay ad={appPoster} onClose={() => setAppPoster(null)} />}
      {!isAuthenticated ? (
        <>
        {IS_NATIVE_APP && (
          <PublicMobileApp api={api} onLogin={() => setPublicPage('login')} initialTab={publicInitialTab} defaultTown={defaultLocation} locationReady={locationReady} />
        )}
        {publicPage !== 'login' ? (
          !IS_NATIVE_APP && <PublicSite page={publicPage} onNavigate={navigatePublicPage} api={api} />
        ) : !langData ? (
          <TranslationsLoadingFallback />
        ) : (
          <>
          <div className={`login-shell${IS_NATIVE_APP ? ' native-login login-overlay' : ''}`}>
            <div className="login-side" style={IS_NATIVE_APP ? { display: 'none' } : undefined}>
              <div className="glow"></div>
              <div className="side-copy">
                <span className="pill-badge" style={{ marginBottom: 18 }}>
                  <span className="dot"></span>
                  {t('trustedByShopsBadge')}
                </span>
                <h2>{t('runYourShopHeading')}<span className="gold-line">{t('smartGoldStandardWaySpan')}</span></h2>
                <p>{t('trackDuplicateKeysDesc')}</p>
              </div>

              <div className="phone-frame">
                <div className="phone-notch"></div>
                <div className="phone-screen">
                  <div className="p-head">
                    <span className="p-title">{t('keyShopDashboardLabel')}</span>
                    <span className="phone-badge"></span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="phone-stat">
                      <div className="num">1,284</div>
                      <div className="lbl">{t('customersStatLabel')}</div>
                    </div>
                    <div className="phone-stat">
                      <div className="num">3,910</div>
                      <div className="lbl">{t('keysCutStatLabel')}</div>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <button type="button" className="back-to-home-link" onClick={() => { setPublicInitialTab('home'); setPublicPage('home'); }} aria-label={t('backToHomeLink')}>
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--card-2)', border: '1.5px solid var(--border-2)', borderRadius: 999, padding: '4px 12px' }}>
                    <Globe className="h-3.5 w-3.5" style={{ color: 'var(--gold)' }} />
                    <select
                      value={lang}
                      onChange={(e) => { setLang(e.target.value); localStorage.setItem('kee_lang', e.target.value); }}
                      style={{ background: 'transparent', color: 'var(--text-1)', border: 'none', fontSize: 12, fontWeight: 700, outline: 'none', cursor: 'pointer', paddingRight: 4 }}
                    >
                      <option value="en" style={{ background: '#181512', color: '#ffffff' }}>English</option>
                      <option value="hi" style={{ background: '#181512', color: '#ffffff' }}>Hindi (हिन्दी)</option>
                      <option value="ta" style={{ background: '#181512', color: '#ffffff' }}>Tamil (தமிழ்)</option>
                      <option value="te" style={{ background: '#181512', color: '#ffffff' }}>Telugu (తెలుగు)</option>
                      <option value="kn" style={{ background: '#181512', color: '#ffffff' }}>Kannada (ಕನ್ನಡ)</option>
                      <option value="ml" style={{ background: '#181512', color: '#ffffff' }}>Malayalam (മലയാളം)</option>
                    </select>
                  </div>
                </div>
                <div className="brand">
                  <img src={keyShopLogo} alt="Key Shop" className="brand-logo" />
                </div>
                <h1>{t('welcomeBackHeading')}</h1>
                <p className="lead">{t('signInLeadDesc')}</p>

                {authError && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.35)', color: '#b91c1c', padding: '12px 14px', borderRadius: 13, marginBottom: 20, fontSize: 12.5, fontWeight: 600 }}>
                    <AlertTriangle className="h-4 w-4 shrink-0" style={{ marginTop: 1 }} />
                    <span>{authError}</span>
                  </div>
                )}

                <form onSubmit={handleLoginSubmit}>
                  <div className="reg-section">
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Mail /></div><b>{t('emailOrMobileLabel')} <span className="req">*</span></b></div>
                      <div className="input-wrap">
                        <input
                          type="text" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)}
                          placeholder={t('emailOrMobilePlaceholder')}
                        />
                      </div>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Lock /></div><b>{t('passwordLabel')} <span className="req">*</span></b></div>
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
                      {t('rememberMeLabel')}
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="forgot-link"
                    >
                      {t('forgotPasswordLink')}
                    </button>
                  </div>
                  <button
                    type="submit" disabled={authLoading}
                    className="btn btn-primary btn-block"
                  >
                    {authLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <>{t('signInToKeyShopBtn')} <ArrowRight /></>}
                  </button>
                  {authSlowNotice && (
                    <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', marginTop: 10 }}>
                      {t('serverWakingUpMsg')}
                    </p>
                  )}
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
                    <Download className="h-4 w-4" /> {t('shopAdminDownloadAppBtn')}
                  </a>
                )}

                <div className="login-foot" style={{ marginTop: 20 }}>
                  {t('wantToRegisterShopMsg')}{' '}
                  <button
                    type="button"
                    onClick={openRegisterShopFlow}
                  >
                    {t('createShopAccountBtn')}
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
                    <h2 style={{ fontSize: 20 }}>{t('resetYourPasswordTitle')}</h2>
                    <p style={{ color: 'var(--text-3)', fontSize: 12, fontWeight: 600, marginTop: 4 }}>{t('secureRecoveryWorkspaceDesc')}</p>
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
                      <p style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13, fontFamily: 'var(--display)' }}>{t('passwordResetSuccessMsg')}</p>
                      <p style={{ color: 'var(--text-3)', fontSize: 12, fontWeight: 600, marginTop: 4, marginBottom: 20 }}>{t('signInWithNewCredentialsMsg')}</p>
                      <button
                        onClick={resetForgotPasswordFlow}
                        className="btn btn-primary btn-block"
                      >
                        {t('returnToLoginBtn')}
                      </button>
                    </div>
                  ) : resetMethod === null ? (
                    <div>
                      <p style={{ color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, textAlign: 'center', lineHeight: 1.6, marginBottom: 18 }}>
                        {t('selectVerificationMethodDesc')}
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setResetMethod('email')}
                          className="qa-btn"
                          style={{ flexDirection: 'column', textAlign: 'center', gap: 10, minWidth: 0 }}
                        >
                          <span className="icon-badge blue"><Mail /></span>
                          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.03em' }}>{t('emailOtpLabel')}</span>
                        </button>
                        <button
                          onClick={() => setResetMethod('phone')}
                          className="qa-btn"
                          style={{ flexDirection: 'column', textAlign: 'center', gap: 10, minWidth: 0 }}
                        >
                          <span className="icon-badge teal"><Phone /></span>
                          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.03em' }}>{t('phoneOtpLabel')}</span>
                        </button>
                      </div>
                      <button
                        onClick={resetForgotPasswordFlow}
                        className="btn btn-ghost btn-block"
                        style={{ marginTop: 14 }}
                      >
                        {t('btnCancel')}
                      </button>
                    </div>
                  ) : !otpVerified ? (
                    <form onSubmit={(e) => { e.preventDefault(); setShowResetOtpModal(true); }}>
                      <p style={{ color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, textAlign: 'center', marginBottom: 16 }}>
                        {t('enterRegisteredMethodTemplate').split('{method}')[0]}{resetMethod === 'email' ? t('emailOtpLabel') : t('phoneOtpLabel')}{t('enterRegisteredMethodTemplate').split('{method}')[1]}
                      </p>
                      <div className="reg-field">
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: resetMethod === 'email' ? 'var(--blue)' : 'var(--teal)' }}>{resetMethod === 'email' ? <Mail /> : <Phone />}</div><b>{resetMethod === 'email' ? t('registeredEmailLabel') : t('registeredPhoneNumberLabel')} <span className="req">*</span></b></div>
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
                      {resetError && <div style={{ color: 'var(--red)', fontSize: 12, fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>{resetError}</div>}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => { setResetMethod(null); setResetIdentifier(''); }}
                          className="btn btn-ghost"
                          style={{ flex: 1 }}
                        >
                          {t('btnBack')}
                        </button>
                        <button
                          type="submit"
                          disabled={resetLoading}
                          className="btn btn-primary"
                          style={{ flex: 2 }}
                        >
                          {resetLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : t('sendOtpCodeBtn')}
                        </button>
                      </div>

                      <Suspense fallback={null}>
                      <OtpVerificationModal
                        open={showResetOtpModal}
                        onClose={() => setShowResetOtpModal(false)}
                        onVerified={() => setOtpVerified(true)}
                        api={api}
                        identifier={resetIdentifier}
                        method={resetMethod || 'email'}
                        purpose="reset"
                        title={t('verifyOtpModalTitle')}
                        description={t('fourDigitCodeDispatchedTemplate').replace('{identifier}', resetIdentifier)}
                        t={t}
                      />
                      </Suspense>
                    </form>
                  ) : (
                    <form onSubmit={handleResetPasswordSubmit}>
                      <p style={{ color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, textAlign: 'center', marginBottom: 16 }}>
                        {t('otpVerifiedSetNewPasswordMsg')}
                      </p>
                      <div className="reg-field">
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Lock /></div><b>{t('newPasswordLabel')} <span className="req">*</span></b></div>
                        <div className="input-wrap">
                          <input
                            type="password"
                            required
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder={t('min6CharactersPlaceholder')}
                          />
                        </div>
                      </div>
                      <div className="reg-field">
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><Lock /></div><b>{t('confirmPasswordLabel')} <span className="req">*</span></b></div>
                        <div className="input-wrap">
                          <input
                            type="password"
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder={t('retypePasswordPlaceholder')}
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={resetLoading}
                        className="btn btn-primary btn-block"
                      >
                        {resetLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : t('updatePasswordBtn')}
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
                      <span className="eyebrow" style={{ marginBottom: 4 }}><Building2 />{t('shopOnboardingEyebrow')}</span>
                      <h2 style={{ fontSize: 19 }}>{t('registerYourKeyShopTitle')}</h2>
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
                      <h3 style={{ fontSize: 16 }}>{t('registrationSubmittedTitle')}</h3>
                      <p style={{ color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, lineHeight: 1.6, padding: '0 8px', marginTop: 8, marginBottom: regLoginEmail ? 12 : 20 }}>
                        {regSuccessMessage}
                      </p>
                      {regLoginEmail && (
                        <div style={{ background: 'var(--card-2)', border: '1.5px dashed var(--gold)', borderRadius: 12, padding: '10px 14px', textAlign: 'center', marginBottom: 20 }}>
                          <p style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>
                            {t('canLogInWithEitherMsg')}
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
                        {t('returnToLoginBtn')}
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
                              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><UserCheck /></div><b>{t('nameLabel')} <span className="req">*</span></b></div>
                              <div className="input-wrap">
                                <input
                                  type="text" required value={regOwnerName} onChange={(e) => setRegOwnerName(e.target.value)}
                                  placeholder="e.g. Rajesh Kumar"
                                />
                              </div>
                            </div>
                            <div className="reg-field">
                              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><Building2 /></div><b>{t('shopNameLabel')} <span className="req">*</span></b></div>
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
                                <b>{t('shopAddressLabel')} <span className="req">*</span></b>
                                <button
                                  type="button" onClick={captureShopLocation} disabled={regLocLoading}
                                  className="reg-trailing loc-btn"
                                >
                                  <Crosshair className={regLocLoading ? 'animate-spin' : ''} />
                                  <span>{regLocLoading ? t('locatingLabel') : t('currentLocationBtn')}</span>
                                </button>
                              </div>
                              <div className="input-wrap">
                                <input
                                  type="text" required value={regLocation}
                                  onChange={(e) => {
                                    setRegLocation(e.target.value);
                                    // Once the owner starts typing their own address, the
                                    // stale "Current Location" failure banner no longer
                                    // applies - they've moved on to manual entry, which is
                                    // fully valid on its own (see the Continue handler below).
                                    if (regLocError) {
                                      setRegLocError('');
                                      setRegLocErrorKind('');
                                    }
                                  }}
                                  placeholder={t('streetLandmarkPlaceholder')}
                                />
                              </div>
                              {/* GPS coordinates captured via the button above are reverse-geocoded
                        server-side and used to silently fill City/State/PIN Code (regCity/
                        regState/regPinCode) as optional metadata alongside the free-text
                        address, and shown here so the owner can confirm what will be stored -
                        but none of the three are required to proceed (see Continue below);
                        Address is the one location field the owner must always be able to
                        fill in by hand when GPS/reverse-geocoding isn't available. */}
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
                                      {t('openLocationSettingsBtn')}
                                    </button>
                                  )}
                                  {regLocErrorKind === 'permission' && IS_NATIVE_APP && (
                                    <button
                                      type="button"
                                      onClick={openAppSettings}
                                      className="cursor-pointer select-none"
                                      style={{ fontSize: 10.5, color: 'var(--gold)', fontWeight: 800, background: 'none', border: 'none', padding: 0, textDecoration: 'underline', marginTop: 2 }}
                                    >
                                      {t('openAppSettingsBtn')}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="reg-field">
                              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><CreditCard /></div><b>{t('aadhaarNumberLabel')}</b></div>
                              <div className="input-wrap">
                                <input
                                  type="text" inputMode="numeric" maxLength={12} value={regAadhaarNumber} onChange={(e) => setRegAadhaarNumber(e.target.value.replace(/\D/g, ''))}
                                  placeholder={t('digitAadhaarOptionalPlaceholder')}
                                />
                              </div>
                            </div>
                            <div className="reg-field">
                              <div className="toggle-field-row">
                                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--red)' }}><Mail /></div><b>{t('emailAddressLabel')}</b></div>
                                <button
                                  type="button" className={`toggle-switch ${regEmailEnabled ? 'on' : ''}`}
                                  onClick={() => setRegEmailEnabled(!regEmailEnabled)} aria-pressed={regEmailEnabled}
                                >
                                  <span className="toggle-thumb" />
                                </button>
                              </div>
                              {regEmailEnabled && (
                                <div className="input-wrap">
                                  <input
                                    type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)}
                                    placeholder="you@example.com"
                                  />
                                </div>
                              )}
                            </div>
                            <div className="reg-field">
                              <div className="toggle-field-row">
                                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Link2 /></div><b>{t('websiteUrlLabel')}</b></div>
                                <button
                                  type="button" className={`toggle-switch ${regWebsiteUrlEnabled ? 'on' : ''}`}
                                  onClick={() => setRegWebsiteUrlEnabled(!regWebsiteUrlEnabled)} aria-pressed={regWebsiteUrlEnabled}
                                >
                                  <span className="toggle-thumb" />
                                </button>
                              </div>
                              {regWebsiteUrlEnabled && (
                                <div className="input-wrap">
                                  <input
                                    type="url" value={regWebsiteUrl} onChange={(e) => setRegWebsiteUrl(e.target.value)}
                                    placeholder={t('websiteUrlPlaceholderEg')}
                                  />
                                </div>
                              )}
                            </div>
                            <div className="reg-field">
                              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--gold)' }}><BadgePercent /></div><b>{t('referralCodeLabel')}</b></div>
                              <div className="input-wrap">
                                <input
                                  type="tel" inputMode="numeric" maxLength={10} value={regReferralCode}
                                  onChange={(e) => setRegReferralCode(e.target.value.replace(/\D/g, ''))}
                                  placeholder={t('referralCodePlaceholder')}
                                />
                              </div>
                            </div>
                            <div className="reg-field">
                              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange, #f59e0b)' }}><Tag /></div><b>{t('fieldCategory')} <span className="req">*</span></b></div>
                              <CustomSelect
                                value={regCategoryId} onChange={setRegCategoryId}
                                disabled={regCategoriesLoading}
                                placeholder={regCategoriesLoading ? t('loadingCategoriesEllipsis') : t('selectShopCategoryPlaceholder')}
                                emptyLabel={t('noShopCategoriesAvailableMsg')}
                                options={regCategories.map((cat) => ({ value: cat.id, label: cat.name }))}
                              />
                            </div>
                            <div className="reg-field">
                              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Phone /></div><b>{t('mobileNumberLabel')} <span className="req">*</span></b></div>
                              <div className="input-wrap">
                                <input
                                  type="tel" required value={regPhone} disabled={regOtpVerified}
                                  onChange={(e) => { setRegPhone(e.target.value); setRegOtpVerified(false); setRegPhoneError(''); }}
                                  placeholder={t('digitMobilePlaceholder')} style={{ opacity: regOtpVerified ? 0.6 : 1 }}
                                />
                              </div>
                              {regPhoneError && (
                                <span style={{ display: 'block', marginTop: 6, fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>{regPhoneError}</span>
                              )}
                            </div>

                            {regOtpVerified ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green)', fontSize: 12, fontWeight: 800 }}>
                                <CheckCircle2 className="h-4 w-4" /> {t('mobileNumberVerifiedMsg')}
                              </div>
                            ) : (
                              <button
                                type="button" onClick={handleOpenRegOtpModal}
                                className="btn btn-primary" style={{ width: '100%' }}
                              >
                                <Phone className="h-4 w-4" />
                                {t('sendOtpToVerifyBtn')}
                              </button>
                            )}

                            <Suspense fallback={null}>
                            <OtpVerificationModal
                              open={showRegOtpModal}
                              onClose={() => setShowRegOtpModal(false)}
                              onVerified={() => setRegOtpVerified(true)}
                              api={api}
                              identifier={regPhone}
                              method="phone"
                              purpose="register"
                              title={t('verifyOtpModalTitle')}
                              description={t('enterOtpCodeSentToPhoneTemplate').replace('{phone}', regPhone)}
                              t={t}
                            />
                            </Suspense>

                            <div className="reg-field" style={{ marginTop: 13 }}>
                              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Lock /></div><b>{t('passwordLabel')} <span className="req">*</span></b></div>
                              <div className="input-wrap">
                                <input
                                  type={showRegPassword ? "text" : "password"} required minLength={6} value={regPassword} onChange={(e) => setRegPassword(e.target.value)}
                                  placeholder={t('min6CharactersPlaceholder')} style={{ paddingRight: 42 }}
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

                          <label className="flex items-center gap-2" style={{ marginTop: 16, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>
                            <input
                              type="checkbox" checked={regTermsAccepted}
                              onChange={(e) => setRegTermsAccepted(e.target.checked)}
                              style={{ width: 16, height: 16, flexShrink: 0 }}
                            />
                            <span>
                              {t('agreeToTermsPrefix')}{' '}
                              <button
                                type="button" onClick={() => setShowTermsModal(true)}
                                style={{ color: 'var(--gold)', fontWeight: 800, textDecoration: 'underline', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                              >
                                {t('termsAndConditionsLinkLabel')}
                              </button>
                            </span>
                          </label>

                          <div className="flex justify-end" style={{ marginTop: 20 }}>
                            <button
                              type="button"
                              onClick={() => {
                                if (!regShopName || !regOwnerName || !regCategoryId || !regPhone || !regLocation) {
                                  alert(t('pleaseFillRequiredRegFieldsMsg'));
                                  return;
                                }
                                // City/State/PIN Code are optional, GPS-derived metadata only
                                // (see the reg-field block above) - Continue must never depend
                                // on "Current Location" having succeeded. A manually-typed
                                // Address on its own is a complete, valid submission.
                                if (regEmailEnabled && regEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail)) {
                                  alert(t('pleaseEnterValidEmailMsg'));
                                  return;
                                }
                                const normalizedRegPhone = normalizePhone(regPhone);
                                if (!normalizedRegPhone) {
                                  alert(`${t('mobileNumberLabel')}: ${PHONE_REGEX_MESSAGE}`);
                                  return;
                                }
                                if (normalizedRegPhone !== regPhone) setRegPhone(normalizedRegPhone);
                                if (regPinCode && !/^\d{6}$/.test(regPinCode)) {
                                  alert(t('pinCodeMustBe6DigitsMsg'));
                                  return;
                                }
                                if (!regTermsAccepted) {
                                  alert(t('pleaseAcceptTermsMsg'));
                                  return;
                                }
                                if (regAadhaarNumber && !/^\d{12}$/.test(regAadhaarNumber)) {
                                  alert(t('aadhaarMustBe12DigitsMsg'));
                                  return;
                                }
                                if (!regOtpVerified) {
                                  alert(t('pleaseVerifyMobileOtpMsg'));
                                  return;
                                }
                                if (!regPassword || regPassword.length < 6) {
                                  alert(t('regPasswordMinLengthMsg'));
                                  return;
                                }
                                setRegStep(2);
                              }}
                              className="btn btn-primary reg-submit-btn"
                            >
                              {t('btnContinue')} <ArrowRight />
                            </button>
                          </div>
                        </div>
                      )}

                      {showTermsModal && createPortal(
                        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.85)' }}>
                          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 620, margin: 'auto', padding: 28, maxHeight: '85vh', overflowY: 'auto' }}>
                            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
                              <h2 style={{ fontSize: 17 }}>{TERMS_AND_CONDITIONS_TITLE}</h2>
                              <button type="button" onClick={() => setShowTermsModal(false)} className="icon-btn">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <p style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                              {TERMS_AND_CONDITIONS_BODY}
                            </p>
                            <div className="flex justify-end" style={{ marginTop: 20 }}>
                              <button
                                type="button"
                                onClick={() => setShowTermsModal(false)}
                                className="btn btn-primary"
                              >
                                {t('btnClose')}
                              </button>
                            </div>
                          </div>
                        </div>,
                        document.body
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
                              <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('settlingPaymentEllipsis')}</h3>
                            </div>
                          )}

                          {(() => {
                            const base = Number(regSubscriptionPrice) || 0;
                            const gstAmount = Math.round(base * (regGstPercent / 100) * 100) / 100;
                            const total = Math.round((base + gstAmount) * 100) / 100;
                            return (
                              <div style={{ background: 'var(--card-2)', padding: 14, borderRadius: 14, border: '1px solid var(--border-2)', marginBottom: 18 }}>
                                <div className="flex justify-between items-center" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
                                  <span>{t('baseAmountLabel')}</span>
                                  <span>Rs. {base.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 10, paddingBottom: 10, borderBottom: '1px dashed var(--border-2)' }}>
                                  <span>{t('gstAmountLabel')} ({regGstPercent}%)</span>
                                  <span>Rs. {gstAmount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                                  <span>{t('totalAmountLabel')}</span>
                                  <span style={{ fontWeight: 800, color: 'var(--gold)', fontSize: 16, fontFamily: 'var(--display)' }}>
                                    Rs. {total.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}

                          <div className="animate-fade-in" style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 20, borderRadius: 16, textAlign: 'center' }}>
                            <ShieldCheck className="h-8 w-8" style={{ color: 'var(--gold)', margin: '0 auto 10px' }} />
                            <p style={{ color: 'var(--text-3)', fontSize: 11.5, fontWeight: 600, lineHeight: 1.6 }}>{t('securePaymentGatewayDesc')}</p>
                          </div>

                          <div className="flex gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
                            <button type="button" onClick={() => setRegStep(1)} className="btn btn-ghost" style={{ flex: 1 }}>
                              {t('btnBack')}
                            </button>
                            <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                              {t('paySettleSetupBtn')}
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
          {IS_NATIVE_APP && (
            <PublicBottomNav
              activeTab={publicInitialTab}
              onGoTab={(tab) => { setPublicInitialTab(tab); setPublicPage('home'); }}
              // Already on the login screen here, so there's nothing useful
              // to prompt - tapping "Add Ads" just dismisses back to Home
              // instead of showing a redundant "please log in" popup.
              onAddAds={() => { setPublicInitialTab('home'); setPublicPage('home'); }}
            />
          )}
          </>
        )}
        </>
      ) : !langData ? (
        <TranslationsLoadingFallback />
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
                <img src={keyShopLogo} alt="Key Shop" className="brand-logo-lg" />
              </span>
              <button className="icon-btn md:hidden" onClick={() => setMobileNavOpen(false)}>
                <X />
              </button>
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
              <div className="side-section-label">{t('navOverview')}</div>
              <button
                onClick={() => resetToDashboard()}
                className={`side-link ${activeTab === 'dashboard' ? 'active' : ''}`}
              >
                <span className="nav-ico" style={{ background: 'var(--maroon)' }}><Sliders /></span>
                <span>{t('dashboard')}</span>
              </button>

              {user.role === 'SUPER_ADMIN' ? (
                <>
                  <div className="side-section-label">{t('navOperations')}</div>
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

                  <div className="side-section-label">{t('navBusiness')}</div>
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
                    <span className="nav-ico" style={{ background: 'var(--blue)' }}><Package /></span>
                    <span>{t('inventory')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('banner-offer-management')}
                    className={`side-link ${activeTab === 'banner-offer-management' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--gold)' }}><Sparkles /></span>
                    <span>Banner &amp; Offers</span>
                  </button>

                  <div className="side-section-label">{t('navSupport')}</div>
                  <button
                    onClick={() => setActiveTab('support-config')}
                    className={`side-link ${activeTab === 'support-config' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--rose)' }}><Phone /></span>
                    <span>{t('supportConfig')}</span>
                  </button>
                </>
              ) : (
                <>
                  <div className="side-section-label">{t('navOperations')}</div>
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

                  <div className="side-section-label">{t('navStore')}</div>
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
                    <span>{t('inventory')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('offers-ads-banners')}
                    className={`side-link ${activeTab === 'offers-ads-banners' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--gold)' }}><Sparkles /></span>
                    <span>{t('offersAdsBanners')}</span>
                  </button>

                  <div className="side-section-label">{t('navSettingsSection')}</div>
                  <button
                    onClick={() => setActiveTab('customer-care')}
                    className={`side-link ${activeTab === 'customer-care' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--rose)' }}><Phone /></span>
                    <span>{t('customerCare')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('settings')}
                    className={`side-link ${activeTab === 'settings' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--maroon)' }}><Settings /></span>
                    <span>{t('settings')}</span>
                  </button>

                  <div className="side-section-label">{t('navMoreSection')}</div>
                  <button
                    onClick={() => setActiveTab('terms')}
                    className={`side-link ${activeTab === 'terms' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--blue)' }}><FileText /></span>
                    <span>{t('menuTermsConditions')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('feedback')}
                    className={`side-link ${activeTab === 'feedback' ? 'active' : ''}`}
                  >
                    <span className="nav-ico" style={{ background: 'var(--gold)' }}><MessageCircle /></span>
                    <span>{t('menuFeedback')}</span>
                  </button>
                </>
              )}
            </nav>

            <div className="sidebar-footer" style={{ borderTop: '1px solid var(--border)', padding: '16px 20px' }}>
              <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
                <span className="avatar">{(user.name || 'U').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="truncate" style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 13, color: 'var(--text-0)' }}>{user.name}</div>
                  <div className="truncate" style={{ fontSize: 11, color: 'var(--text-3)' }}>{user.email || t('noEmailOnFileLabel')}</div>
                </div>
              </div>
              <button
                onClick={() => { logout(); if (IS_NATIVE_APP) { setPublicInitialTab('home'); setPublicPage('home'); } }}
                className="side-link"
                style={{ color: 'var(--red)' }}
              >
                <LogOut />
                <span>{t('logout')}</span>
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
                {/* The header no longer carries a search/filter box on any
                    screen, including the Dashboard - every page still has
                    its own fully independent search box where relevant. */}
                <div className="header-page-title truncate">
                  {user.role === 'SUPER_ADMIN' ? 'Key Shop' : (shopDisplayName || user.name)}
                </div>
              </div>

              <div className="flex items-center gap-3 relative app-topbar-actions">
                {user.role !== 'SUPER_ADMIN' && (
                  <button
                    onClick={handleHeaderReferShare}
                    disabled={headerReferralSharing}
                    className="icon-btn"
                    title={t('referBtnTitle')}
                    style={{ width: 38, height: 38 }}
                  >
                    {headerReferralSharing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                  </button>
                )}

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
                      <h3 style={{ fontSize: 13 }}>{t('notificationsTitle')}</h3>
                      {unreadCount > 0 && (
                        <button
                          onClick={async () => {
                            try {
                              // Fired in parallel instead of one at a time -
                              // this list is capped at 50 (see
                              // NotificationService.getNotifications), so at
                              // most 50 concurrent requests, versus up to 50
                              // sequential round-trips one on top of another.
                              const markRead = user.role === 'SUPER_ADMIN' ? api.markSuperNotificationRead : api.markNotificationRead;
                              await Promise.all(notifications.filter(n => !n.isRead).map(n => markRead(n.id)));
                              fetchNotifications();
                            } catch (e) {
                              console.error(e);
                            }
                          }}
                          style={{ fontSize: 10, fontWeight: 800, color: 'var(--gold)', textTransform: 'uppercase' }}
                        >
                          {t('markAllRead')}
                        </button>
                      )}
                    </div>
                    <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {notifications.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, padding: '24px 0' }}>{t('noNotificationsFound')}</div>
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

            {activeTab === 'dashboard' && <DashboardView t={t} setActiveTab={setActiveTab} setSearchDispatch={setSearchDispatch} setAutoOpenListingModal={setAutoOpenListingModal} />}
            {activeTab === 'shops' && <ShopsManagementView t={t} api={api} initiallyOpenAddModal={autoOpenShopModal} onCloseInitiallyOpen={() => setAutoOpenShopModal(false)} searchDispatch={searchDispatch} defaultTown={defaultLocation} locationReady={locationReady} />}
            {activeTab === 'dealers' && <DealersView t={t} api={api} defaultTown={defaultLocation} locationReady={locationReady} />}
            {activeTab === 'key-shops' && <CategoryShopsView categoryKey="KEY_SHOPS" icon={KeyRound} t={t} api={api} defaultTown={defaultLocation} locationReady={locationReady} />}
            {activeTab === 'ecm' && <CategoryShopsView categoryKey="ECM" icon={Cpu} t={t} api={api} defaultTown={defaultLocation} locationReady={locationReady} />}
            {activeTab === 'meter' && <CategoryShopsView categoryKey="METER" icon={Gauge} t={t} api={api} defaultTown={defaultLocation} locationReady={locationReady} />}
            {activeTab === 'scanning' && <CategoryShopsView categoryKey="SCANNER" icon={ScanLine} t={t} api={api} defaultTown={defaultLocation} locationReady={locationReady} />}
            {activeTab === 'super-customers' && <SuperCustomersView t={t} api={api} searchDispatch={activeTab === 'super-customers' ? searchDispatch : null} />}
            {activeTab === 'keys' && <KeysCatalogView t={t} api={api} searchDispatch={activeTab === 'keys' ? searchDispatch : null} />}
            {activeTab === 'revenue' && <RevenueManagementView t={t} api={api} />}
            {activeTab === 'promotions' && <PromotionsView t={t} api={api} user={user} searchDispatch={activeTab === 'promotions' ? searchDispatch : null} initiallyOpenAddModal={autoOpenListingModal} onCloseInitiallyOpen={() => setAutoOpenListingModal(false)} defaultTown={defaultLocation} locationReady={locationReady} />}
            {activeTab === 'banner-offer-management' && <AdsManagementView t={t} api={api} />}
            {activeTab === 'offers-ads-banners' && <OffersAdsBannersView t={t} api={api} />}
            {activeTab === 'search-keys' && <KeysSearchView t={t} api={api} searchDispatch={activeTab === 'search-keys' ? searchDispatch : null} />}
            {activeTab === 'register' && <CustomerRegistrationWizard t={t} api={api} />}
            {activeTab === 'history' && <CustomerHistoryView t={t} api={api} searchDispatch={activeTab === 'history' ? searchDispatch : null} />}
            {activeTab === 'reports' && <ReportsPortalView t={t} api={api} />}
            {activeTab === 'customer-care' && <CustomerCareView t={t} api={api} />}
            {activeTab === 'support-contact' && <SupportContactView t={t} api={api} />}
            {activeTab === 'support-config' && <SupportConfigView t={t} api={api} />}
            {activeTab === 'settings' && <ShopSettingsView t={t} api={api} />}
            {activeTab === 'terms' && <StaticInfoView icon={FileText} eyebrow={t('menuTermsConditions')} title={TERMS_AND_CONDITIONS_TITLE} body={TERMS_AND_CONDITIONS_BODY} />}
            {activeTab === 'feedback' && <FeedbackView t={t} api={api} />}
          </main>

          {/* Mobile Bottom Navigation Bar (mobile only) */}
          <nav className="mobile-bottom-nav md:hidden">
            <button
              className={`mbn-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => { resetToDashboard(); setMobileNavOpen(false); }}
            >
              <span className="nav-ico-sm" style={{ background: 'var(--maroon)' }}><Home /></span>
              <span>{t('dashboard')}</span>
            </button>
            <button
              className="mbn-item"
              onClick={() => setShowLangDialog(true)}
            >
              <span className="nav-ico-sm" style={{ background: 'var(--teal)' }}><Languages /></span>
              <span>{t('language')}</span>
            </button>
            <button
              className={`mbn-item ${(user.role === 'SUPER_ADMIN' ? activeTab === 'support-config' : activeTab === 'support-contact') ? 'active' : ''}`}
              onClick={() => {
                // Role-based destination: Super Admin manages the global
                // support config (WhatsApp number + training videos), while
                // Shop Admin views the already-configured owner contact info.
                setActiveTab(user.role === 'SUPER_ADMIN' ? 'support-config' : 'support-contact');
                setMobileNavOpen(false);
              }}
            >
              <span className="nav-ico-sm" style={{ background: 'var(--rose)' }}><Headset /></span>
              <span>{t('customerService')}</span>
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
              {t('pressBackToExit')}
            </div>,
            document.body
          )}

          {downloadToastVisible && createPortal(
            <div
              style={{
                position: 'fixed',
                left: '50%',
                bottom: 88,
                transform: 'translateX(-50%)',
                background: 'rgba(20, 18, 16, 0.95)',
                color: 'var(--gold)',
                border: '1px solid var(--gold)',
                padding: '10px 22px',
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 700,
                zIndex: 99999,
                pointerEvents: 'none',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                backdropFilter: 'blur(8px)'
              }}
            >
              <CheckCircle2 style={{ width: 16, height: 16, color: 'var(--green)' }} />
              <span>Document downloaded successfully.</span>
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
                  <h2 style={{ fontSize: 17 }}>{t('chooseLanguage')}</h2>
                  <p style={{ color: 'var(--text-3)', fontSize: 12, fontWeight: 600, marginTop: 4 }}>{t('selectLanguageDesc')}</p>
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
  { type: 'Used Machines', icon: Wrench, image: usedMachinesImg, description: 'View and manage used machines', imgScale: 1.25, accent: 'var(--purple)' },
  { type: 'ECM', icon: Cpu, image: ecmServiceImg, description: 'Manage ECM records', accent: 'var(--orange)' },
  // imgScale: the Meter product photo has more transparent padding baked
  // into the source image than the other three, so at the shared
  // .icon-badge.photo size it reads visibly smaller than its siblings even
  // though the box is identical - a small CSS scale-up (applied to the
  // <img> only, box size untouched) compensates for that without affecting
  // Used Machines/ECM/Scanning.
  { type: 'Meter', icon: Gauge, image: meterServiceImg, description: 'Track and manage meter records', imgScale: 1.14, accent: 'var(--skyblue)' },
  { type: 'Scanning', icon: ScanLine, image: scanningServiceImg, description: 'Scan & process compliance entries', accent: 'var(--teal)' },
];

// Maps each DASHBOARD_PRODUCT_CARDS.type (a fixed display type, not the
// dynamic category name matched by goToProductType) to its [title, description]
// translation keys, so the dashboard cards render translated text.
const PRODUCT_TYPE_LABEL_KEYS = {
  'Used Machines': ['usedMachines', 'usedMachinesDesc'],
  'ECM': ['ecmService', 'ecmServiceDesc'],
  'Meter': ['meterService', 'meterServiceDesc'],
  'Scanning': ['scanningService', 'scanningServiceDesc'],
};

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
            className={`dash-card animate-fade-in${item.fullWidth ? ' dash-card-full' : ''}${item.accent ? ' dash-card-tint' : ''}`}
            style={{ animationDelay: `${idx * 0.05}s`, ...(item.accent ? { '--tint': item.accent } : {}) }}
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

// In-memory cache (module scope, resets on a full page reload) so coming
// back to the Dashboard after visiting another tab shows the last-fetched
// data instantly instead of blanking to a loading spinner every time -
// DashboardView unmounts/remounts on every tab switch (see the
// `activeTab === 'dashboard' &&` gate around its render site), so without
// this every single revisit paid a full network round-trip before showing
// anything. Keyed by user.id so switching accounts (logout -> a different
// login, same page session) can't leak stale data across users.
let dashboardCache = null;

// Shared by both the Shop Admin and Super Admin Dashboard greetings.
function getTimeBasedGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

function DashboardView({ t, setActiveTab, setSearchDispatch, setAutoOpenListingModal }) {
  const { user, api } = useAuth();
  const cachedData = dashboardCache && dashboardCache.userId === user.id ? dashboardCache.data : null;
  const [data, setData] = useState(cachedData);
  const [loading, setLoading] = useState(!cachedData);
  const [popupAds, setPopupAds] = useState([]);
  // Shown only if the very first load (no cache yet) is still pending after
  // a few seconds - see authSlowNotice's identical rationale (free-tier
  // backend cold-start after inactivity).
  const [slowNotice, setSlowNotice] = useState(false);
  useEffect(() => {
    if (!loading) { setSlowNotice(false); return; }
    const timer = setTimeout(() => setSlowNotice(true), 4000);
    return () => clearTimeout(timer);
  }, [loading]);

  // Tapping Key Shops, ECM, Meter, or Scanning category cards on the Dashboard navigates to
  // their dedicated category screens (key-shops, ecm, meter, scanning).
  const goToProductType = (productType) => {
    if (productType === 'Used Machines' || productType === 'USED_MACHINES') {
      setSearchDispatch(null);
      setActiveTab('promotions');
      return;
    }
    if (productType === 'Key Shops' || productType === 'KEY_SHOPS') {
      setActiveTab('key-shops');
    } else if (productType === 'ECM') {
      setActiveTab('ecm');
    } else if (productType === 'Meter') {
      setActiveTab('meter');
    } else if (productType === 'Scanning' || productType === 'Scanner') {
      setActiveTab('scanning');
    } else {
      setSearchDispatch({ query: productType, type: 'productType', nonce: Date.now() });
      setActiveTab('promotions');
    }
  };

  // "Add Machines" quick action jumps straight to the Inventory screen and
  // auto-opens its create-listing dialog (Shop Admin only - the Super Admin
  // cannot publish listings).
  const goToAddMachines = () => {
    setAutoOpenListingModal(true);
    setActiveTab('promotions');
  };

  // Super Admin "Offers" quick action jumps straight to Banner & Offer
  // Management (Advertisement Campaigns) - not the plain Inventory/Machines
  // feed ('promotions'), which is a different screen entirely.
  const goToOffers = () => {
    setActiveTab('banner-offer-management');
  };

  const dismissPopupAds = () => {
    popupAds.forEach(ad => sessionStorage.setItem(`dismissed_ad_${ad.id}`, 'true'));
    setPopupAds([]);
  };

  useEffect(() => {
    if (popupAds.length > 0) {
      const timer = setTimeout(dismissPopupAds, 10000);
      return () => clearTimeout(timer);
    }
  }, [popupAds]);

  useEffect(() => {
    fetchDashboardData();
    if (user.role === 'SHOP_ADMIN') {
      fetchPopupAds();
    }
  }, [user]);

  const fetchPopupAds = async () => {
    try {
      const ads = await api.getAdvertisements();
      const popups = ads
        .filter(ad => ad.type === 'POPUP')
        .filter(ad => !sessionStorage.getItem(`dismissed_ad_${ad.id}`))
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 3);
      if (popups.length > 0) setPopupAds(popups);
    } catch (e) {
      console.error('Failed to fetch advertisements for popup', e);
    }
  };

  const fetchDashboardData = async () => {
    // Only show the spinner on a genuinely first load for this user - if
    // we're rendering from cache already, refresh silently in the
    // background instead of blanking the screen the visitor just saw.
    if (!data) setLoading(true);
    try {
      const res = await api.getDashboard();
      setData(res);
      dashboardCache = { userId: user.id, data: res };
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, minHeight: 260 }}>
        <div className="brand-loading-track"><div className="brand-loading-fill" /></div>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingDashboard')}</span>
        {slowNotice && (
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', textAlign: 'center', maxWidth: 260 }}>{t('serverWakingUpMsg')}</span>
        )}
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
            <h1>{getTimeBasedGreeting()}, {(user.name || 'Admin').split(' ')[0]} 👋</h1>
          </div>
        </div>

        {/* Compact, approved dashboard layout - only the essential shortcut
            cards, no reports/lists/charts below. New Customer first, then
            Shops (2nd card), then the 4 product-category shortcuts (6 cards
            = exactly 3 full rows in the 2-column grid), then a full-width,
            shorter Customer Support card spanning both columns. All cards
            share the same size/spacing via DashCardGrid. */}
        <DashCardGrid items={[
          { title: t('newCustomer'), description: t('registerComplianceEntry'), icon: AddCustomerIcon, iconVariant: 'flat-icon', accent: 'var(--gold)', onClick: () => setActiveTab('super-customers') },
          { title: t('shopsCardTitle'), description: t('viewManageShopsDesc'), image: keyShopLogo, accent: 'var(--maroon)', onClick: () => setActiveTab('shops') },
          { title: t('dealers'), description: t('dealersDesc'), image: dealerIcon, accent: 'var(--maroon)', onClick: () => setActiveTab('dealers') },
          { title: t('usedMachines'), description: t('usedMachinesDesc'), image: usedMachinesImg, imgScale: 1.25, accent: 'var(--purple)', onClick: () => goToProductType('Used Machines') },
          { title: t('ecm'), description: t('ecmDesc'), image: ecmServiceImg, accent: 'var(--orange)', onClick: () => goToProductType('ECM') },
          { title: t('scanning'), description: t('scanningDesc'), image: scanningServiceImg, accent: 'var(--teal)', onClick: () => goToProductType('Scanning') },
          { title: t('meter'), description: t('meterDesc'), image: meterServiceImg, imgScale: 1.14, accent: 'var(--skyblue)', onClick: () => goToProductType('Meter') },
          { title: t('offersLabel'), description: t('activeOffersBannersDesc') || 'Active offers, banners & promotions', icon: Sparkles, iconVariant: 'flat-icon', accent: 'var(--gold)', onClick: goToOffers },
          { title: t('customerSupport'), description: t('manageCustomerSupportDesc'), image: customerSupportIcon, fullWidth: true, compact: true, accent: 'var(--rose)', onClick: () => setActiveTab('support-config') },
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
          <img src={keyShopLogo} alt="Key Shop" style={{ width: 84, height: 84, objectFit: 'contain', flexShrink: 0 }} />
          <div>
            <h1>{getTimeBasedGreeting()}, {firstName} 👋</h1>
          </div>
        </div>
      </div>

      {sub && sub.daysRemaining <= 7 && (
        <div className="card" style={{ marginBottom: 10, padding: 14, borderColor: 'rgba(240,185,11,0.4)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div className="icon-badge rose"><AlertTriangle /></div>
            <div>
              <p style={{ fontFamily: 'var(--display)', fontWeight: 700, color: 'var(--text-0)', fontSize: 14 }}>{t('subscriptionRenewalRequired')}</p>
              <p style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, marginTop: 2 }}>
                {t('subscriptionExpiresIn').split('{days}')[0]}<b style={{ color: 'var(--gold)' }}>{sub.daysRemaining}</b>{t('subscriptionExpiresIn').split('{days}')[1]}
              </p>
            </div>
          </div>
          <div className="pill-badge">
            <span className="dot"></span>
            {sub.plan} {t('planSuffix')}
          </div>
        </div>
      )}

      {/* Compact, approved dashboard layout - only the essential shortcut cards,
          no reports/lists/charts below. One combined grid so every card shares
          the same size/spacing: Quick Actions (New Customer, Search Keys), the
          4 product-category shortcuts, then a full-width, shorter Customer
          Support card spanning both columns. */}
      <DashCardGrid items={[
        { title: t('newCustomer'), description: t('registerComplianceEntry'), icon: AddCustomerIcon, iconVariant: 'flat-icon', accent: 'var(--gold)', onClick: () => setActiveTab('register') },
        { title: t('usedMachines'), description: t('usedMachinesDesc'), image: usedMachinesImg, imgScale: 1.25, accent: 'var(--purple)', onClick: () => goToProductType('Used Machines') },
        { title: t('keyShops'), description: t('keyShopsDesc'), image: keyShopLogo, accent: 'var(--maroon)', onClick: () => goToProductType('Key Shops') },
        { title: t('dealers'), description: t('dealersDesc'), image: dealerIcon, accent: 'var(--maroon)', onClick: () => setActiveTab('dealers') },
        { title: t('ecm'), description: t('ecmDesc'), image: ecmServiceImg, accent: 'var(--orange)', onClick: () => goToProductType('ECM') },
        { title: t('scanning'), description: t('scanningDesc'), image: scanningServiceImg, accent: 'var(--teal)', onClick: () => goToProductType('Scanning') },
        { title: t('meter'), description: t('meterDesc'), image: meterServiceImg, imgScale: 1.14, accent: 'var(--skyblue)', onClick: () => goToProductType('Meter') },
        { title: t('offersLabel'), description: t('activeOffersBannersDesc') || 'Active offers, banners & promotions', icon: Sparkles, iconVariant: 'flat-icon', accent: 'var(--gold)', onClick: () => setActiveTab('offers-ads-banners') },
        { title: t('customerSupport'), description: t('getHelpSupportDesc'), image: customerSupportIcon, fullWidth: true, compact: true, accent: 'var(--rose)', onClick: () => setActiveTab('customer-care') },
      ]} />

      {/* Active Announcements Popup Modal - shows 2-3 ads/banners/offers together
          in a colorful mixed grid, each tile the actual uploaded image with no
          placeholder copy. */}
      {popupAds.length > 0 && createPortal(
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/85 backdrop-blur-md flex justify-center items-center p-4 md:p-10">
          <div className="card animate-fade-in" style={{ width: 'clamp(320px, 80vw, 860px)', overflow: 'hidden', margin: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-center justify-between" style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
              <span className="badge badge-gold">
                <Sparkles style={{ width: 11, height: 11 }} /> {t('featuredOffersBanners')}
              </span>
              <button onClick={dismissPopupAds} className="icon-btn">
                <X />
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: popupAds.length === 1 ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 16,
                padding: 22,
              }}
            >
              {popupAds.map((ad, i) => {
                const accents = ['var(--gold)', 'var(--teal)', 'var(--rose)', 'var(--purple)', 'var(--skyblue)'];
                const accent = accents[i % accents.length];
                return (
                  <div
                    key={ad.id}
                    style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${accent}`, background: 'var(--card-2)', display: 'flex', flexDirection: 'column' }}
                  >
                    <img src={cleanGoogleImageUrl(ad.imageUrl)} alt={ad.title} style={{ width: '100%', height: 160, objectFit: 'cover' }} />
                    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                      <span className="badge" style={{ alignSelf: 'flex-start', background: accent, color: 'var(--bg-0, #0a0908)', fontSize: 10 }}>
                        {ad.type === 'BANNER' ? t('banner') : ad.type === 'NOTICE' ? t('notice') : t('offer')}
                      </span>
                      <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 13.5, color: 'var(--text-0)', lineHeight: 1.3 }}>{ad.title}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ borderTop: '1px solid var(--border)', padding: '16px 22px', display: 'flex', gap: 10 }}>
              <button onClick={dismissPopupAds} className="btn btn-ghost btn-block">
                {t('btnDismiss')}
              </button>
              <button
                onClick={() => {
                  dismissPopupAds();
                  setActiveTab('offers-ads-banners');
                }}
                className="btn btn-primary btn-block"
              >
                {t('viewAllOffersBanners')}
              </button>
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
// Page size for the Shop Management screen's cursor pagination - see
// ShopService.getShops.
const SHOP_MANAGEMENT_PAGE_SIZE = 20;

// Caches only the first page of the default (no-search) list - module
// scope. This view unmounts/remounts on every tab switch, so without this
// every revisit blanked to a spinner and re-fetched page 1 from scratch
// even with an empty search box.
let shopsFirstPageCache = null;

function ShopsManagementView({ t, api, initiallyOpenAddModal, onCloseInitiallyOpen, searchDispatch, defaultTown, locationReady }) {
  const [shops, setShops] = useState(shopsFirstPageCache ? shopsFirstPageCache.items : []);
  const [loading, setLoading] = useState(!shopsFirstPageCache);
  // Infinite-scroll pagination state - `shops` only ever holds the pages
  // loaded so far, never the whole platform-wide registry.
  const [nextCursor, setNextCursor] = useState(shopsFirstPageCache ? shopsFirstPageCache.nextCursor : null);
  const [hasMore, setHasMore] = useState(shopsFirstPageCache ? shopsFirstPageCache.hasMore : false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef(null);
  const [showAddModal, setShowAddModal] = useState(false);
  // Search is now server-side (see fetchShops) so pagination stays correct
  // across pages - debounced before it reaches the server, since every
  // change now triggers a network request instead of filtering an
  // already-fully-loaded list.
  const [shopSearchQuery, setShopSearchQuery] = useState('');
  const [debouncedShopSearchQuery, setDebouncedShopSearchQuery] = useState('');
  const [town, setTown, filterReady] = useLocationFilter(defaultTown, locationReady);
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedShopSearchQuery(shopSearchQuery.trim()), 300);
    return () => clearTimeout(handle);
  }, [shopSearchQuery]);

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
  // Full Shop Settings (GST, verification document, referral code) for a
  // given shop, reusing the same ShopSettingsView the Shop Admin sees on
  // their own dashboard - scoped to this shop via the shopId prop.
  const [fullSettingsShopId, setFullSettingsShopId] = useState(null);
  const [selectedShop, setSelectedShop] = useState(null);

  useBackHandler(showAddModal, () => { resetAddForm(); setShowAddModal(false); });
  useBackHandler(showSubModal, () => setShowSubModal(false));
  useBackHandler(showEditModal, () => setShowEditModal(false));
  useBackHandler(!!fullSettingsShopId, () => setFullSettingsShopId(null));

  // Form States for Add Shop
  const [shopName, setShopName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  // Informational only - the actual end date is computed server-side (always
  // exactly one year from creation, see ShopService.createShop).
  const [subEndDate, setSubEndDate] = useState('');
  const [provisionPhone, setProvisionPhone] = useState('');
  const [provisionWhatsapp, setProvisionWhatsapp] = useState('');
  const [provisionLocation, setProvisionLocation] = useState('');
  const [provisionLocLoading, setProvisionLocLoading] = useState(false);
  const [provisionLocError, setProvisionLocError] = useState('');
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

  // Single yearly subscription price platform-wide, Super Admin-configurable
  // (see SupportConfigView / PlatformConfig.subscriptionPrice).
  const [subscriptionPrice, setSubscriptionPrice] = useState(999);

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

  const fetchSubscriptionPrice = async () => {
    try {
      const res = await api.getSupportConfig();
      setSubscriptionPrice(res.subscriptionPrice ?? 999);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchSubscriptionPrice();
  }, []);

  // Single yearly plan - end date is always exactly one year from today.
  useEffect(() => {
    const now = new Date();
    now.setFullYear(now.getFullYear() + 1);
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    setSubEndDate(`${yyyy}-${mm}-${dd}`);
  }, []);

  // Loads the first page for the current search, replacing whatever was
  // loaded before.
  const fetchShops = async () => {
    // Only blank to a spinner for a real search or a genuinely empty
    // screen - a bare revisit renders the cached first page instantly and
    // refreshes silently in the background.
    if (debouncedShopSearchQuery || town || shops.length === 0) setLoading(true);
    try {
      const res = await api.getShopsPage({ search: debouncedShopSearchQuery, town, limit: SHOP_MANAGEMENT_PAGE_SIZE });
      setShops(res.items);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
      // "Default view" now means "town is either empty or whatever GPS
      // resolved as the default" - not just empty - since locationReady
      // gating (see App()'s locationReady) means the very first fetch may
      // already carry a GPS-resolved town instead of ''. Comparing against
      // '' only would mean this cache (and the instant-render-on-revisit it
      // powers) never populates at all for any user with a resolved
      // location.
      if (!debouncedShopSearchQuery && (!town || town === defaultTown)) {
        shopsFirstPageCache = { items: res.items, nextCursor: res.nextCursor, hasMore: !!res.nextCursor };
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Appends the next page - triggered by the sentinel scrolling into view or
  // the manual "Load More" fallback button.
  const fetchMoreShops = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.getShopsPage({ search: debouncedShopSearchQuery, town, cursor: nextCursor, limit: SHOP_MANAGEMENT_PAGE_SIZE });
      setShops((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  // Waits for locationReady (GPS permission/coordinate resolution to finish)
  // before firing the very first fetch - otherwise this would fetch with an
  // unresolved '' town immediately on mount, then re-fetch and swap results
  // once the GPS default arrives, flickering between all-location and
  // location-filtered results. Deliberately `filterReady` (useLocationFilter's
  // 3rd return value), not the raw `locationReady` prop - see that hook's
  // comment for why gating on `locationReady` alone still let one fetch
  // through with a stale '' town. A bare revisit still renders the cached
  // first page (see `shopsFirstPageCache` above) regardless, since
  // filterReady is already true by then.
  useEffect(() => {
    if (!filterReady) return;
    fetchShops();
  }, [debouncedShopSearchQuery, town, filterReady]);

  useEffect(() => {
    const node = loadMoreSentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchMoreShops();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, nextCursor, loadingMore, debouncedShopSearchQuery, town]);

  const executeShopCreation = async (dto) => {
    try {
      await api.createShop(dto);
      setShowAddModal(false);
      resetAddForm();
      fetchShops();
    } catch (err) {
      setErrorMsg(err.message || t('failedToCreateShop'));
      throw err;
    }
  };

  // "Current Location" for the Create Shop dialog's single Shop Address field -
  // mirrors captureShopLocation in the public self-registration wizard, minus
  // the city/state/pinCode side effects since this dialog has no such fields.
  const captureProvisionLocation = async () => {
    setProvisionLocError('');
    setProvisionLocLoading(true);
    let lat, lng;
    try {
      ({ lat, lng } = await resolveCurrentLocation());
    } catch (e) {
      setProvisionLocError(e.message);
      setProvisionLocLoading(false);
      return;
    }
    const data = await reverseGeocode(lat, lng);
    const fullAddress = data?.displayName || [data?.street, data?.locality].filter(Boolean).join(', ');
    setProvisionLocation(fullAddress || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    setProvisionLocLoading(false);
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
        alert(t('ownerAadhaarMandatory'));
        return;
      }

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
      // plan/endDate are NOT sent - a single YEARLY plan is enforced and
      // computed server-side (see ShopService.createShop).
      const dto = {
        name: shopName,
        adminEmail,
        adminName,
        adminPassword,
        companyDetails,
        themeColor: '#C89416',
        shopPhoto: provisionShopPhoto,
        shopLicense: provisionShopLicense,
        ownerAadhaar: provisionOwnerAadhaar
      };

      const price = subscriptionPrice ?? 0;
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
      setErrorMsg(err.message || t('failedInitCheckout'));
    }
  };

  const executePaymentProvision = async (e) => {
    e.preventDefault();
    setPaymentProcessing(true);

    const logs = [
      t('logEstablishingTunnel'),
      t('logVerifyingBalance'),
      t('logAuthorizingEscrow'),
      t('logEncryptingCard'),
      t('logFulfillingProvisioning'),
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
      alert(t('paymentFailedPrefix').replace('{message}', err.message));
    }
  };

  const resetAddForm = () => {
    setShopName('');
    setAdminEmail('');
    setAdminName('');
    setAdminPassword('');
    setProvisionPhone('');
    setProvisionWhatsapp('');
    setProvisionLocation('');
    setProvisionLocError('');
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

  // Renews the shop's subscription for a fresh one-year YEARLY window,
  // starting now (see ShopService.updateSubscription).
  const handleUpdateSubscriptionSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.updateSubscription(selectedShop.id, { status: 'ACTIVE' });
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
        gst: editGst,
        phone: editPhone,
      });

      await api.updateShop(selectedShop.id, {
        name: editName,
        companyDetails
      });
      setShowEditModal(false);
      fetchShops();
    } catch (err) {
      alert(err.message || t('updateFailedMsg'));
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Layers /> {t('platformOperations')}</div>
          <h1>{t('shops')}</h1>
          <p>{t('provisionShopsDesc')}</p>
        </div>
      </div>

      {/* Portaled to document.body, not a plain sibling here - this .animate-
          fade-in ancestor's fadeIn animation has fill-mode: forwards, which
          leaves a non-none `transform` applied permanently after it
          finishes. A `transform` on an ancestor creates a new containing
          block for `position: fixed` descendants (they'd end up fixed
          relative to this div's box, not the viewport) - the portal is what
          keeps the FAB truly pinned to the screen corner regardless. */}
      {createPortal(
        <button
          type="button"
          onClick={() => { resetAddForm(); setShowAddModal(true); }}
          className="fab"
          aria-label={t('provisionNewShop')}
          title={t('provisionNewShop')}
        >
          <Plus />
        </button>,
        document.body
      )}

      {/* Search box stays mounted regardless of loading/results state so it
          never loses focus while typing. Filtering is instant/client-side
          (partial, case-insensitive match) since the whole shop list is
          already in memory. */}
      <div className="card table-card">
        <div className="table-head">
          <h2 style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 17 }}>
            {t('allShops')} <span style={{ color: 'var(--text-3)', fontWeight: 700, fontSize: 13 }}>({shops.length})</span>
          </h2>
          <div className="search-box">
            <Search />
            <input
              type="text" value={shopSearchQuery} onChange={(e) => setShopSearchQuery(e.target.value)}
              placeholder={t('searchShopsPlaceholder')}
            />
          </div>
          <CustomSelect
            className="location-filter-select"
            icon={MapPin}
            value={town}
            onChange={setTown}
            placeholder="All Locations"
            searchable
            searchPlaceholder="Search district or town…"
            options={[{ value: '', label: 'All Locations' }, ...ALL_TN_LOCATIONS.map((loc) => ({ value: loc, label: loc }))]}
            triggerStyle={{ minWidth: 180 }}
          />
        </div>

        {(() => {
          if (loading) {
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 200 }}>
                <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingShopRegistry')}</span>
              </div>
            );
          }

          if (shops.length === 0) {
            return (
              <p style={{ padding: 24, fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>
                {debouncedShopSearchQuery
                  ? t('noShopsMatchSearch')
                  : t('noShopsProvisionedYet')}
              </p>
            );
          }

          return (
            <div className="dealer-list stagger-in">
              {shops.map(s => {
                let details = {};
                if (s.companyDetails) {
                  try { details = typeof s.companyDetails === 'string' ? JSON.parse(s.companyDetails) : s.companyDetails; } catch (e) {}
                }
                const shopPhone = details.phone || s.phone || s.users?.[0]?.phone;
                const shopAddress = details.address || s.address || (s.users?.[0]?.email ? `Admin: ${s.users[0].email}` : null);
                const shopWebsite = details.website || s.website;
                const shopCategory = s.category || 'Key Shop';

                return (
                  <div key={s.id} className="dealer-row" onClick={() => setFullSettingsShopId(s.id)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                      <div className="dealer-logo">
                        <img src={s.shopPhoto || keyShopLogo} alt={s.name} />
                      </div>
                      <div className="dealer-info">
                        <div className="dealer-name" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span>{s.name}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleShopStatus(s); }}
                            title={t('toggleShopActiveStatusTitle')}
                            className={`badge ${s.isActive ? 'badge-active' : 'badge-suspended'}`}
                            style={{ border: 'none', cursor: 'pointer', padding: '2px 8px', fontSize: 10 }}
                          >
                            <span className="dot" />{s.isActive ? t('active') : t('suspended')}
                          </button>
                        </div>
                        {shopCategory && (
                          <div className="dealer-line">
                            <Tag style={{ width: 13, height: 13, color: 'var(--text-3)' }} /> <span>{shopCategory}</span>
                          </div>
                        )}
                        {shopAddress && (
                          <div className="dealer-line">
                            <MapPin style={{ width: 13, height: 13, color: 'var(--text-3)' }} /> <span>{shopAddress}</span>
                          </div>
                        )}
                        {shopPhone && (
                          <div className="dealer-line">
                            <Phone style={{ width: 13, height: 13, color: 'var(--text-3)' }} /> <span>{shopPhone}</span>
                          </div>
                        )}
                        {shopWebsite && (
                          <div className="dealer-line">
                            <Globe style={{ width: 13, height: 13, color: 'var(--gold)' }} />
                            <a href={shopWebsite.startsWith('http') ? shopWebsite : `https://${shopWebsite}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--gold)', textDecoration: 'none' }}>
                              {shopWebsite}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="dealer-quick-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {shopPhone && (
                        <a href={`tel:${shopPhone}`} className="dealer-quick-btn call" onClick={(e) => e.stopPropagation()}>
                          <Phone className="h-3.5 w-3.5" />
                          <span>{t('callPrefix') || 'Call'}</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setFullSettingsShopId(s.id); }}
                        className="icon-btn"
                        style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--card-2)', color: 'var(--gold)' }}
                        title={t('viewDetails')}
                      >
                        <ChevronRight style={{ width: 18, height: 18 }} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Infinite scroll (sentinel) + manual "Load More" fallback - see
            PromotionsFeed's identical pattern for why both exist. */}
        {!loading && hasMore && (
          <div ref={loadMoreSentinelRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 20 }}>
            {loadingMore ? (
              <RefreshCw className="animate-spin" style={{ width: 20, height: 20, color: 'var(--gold)' }} />
            ) : (
              <button type="button" onClick={fetchMoreShops} className="btn btn-outline btn-sm">
                {t('loadMoreBtn')}
              </button>
            )}
          </div>
        )}
      </div>

      {showAddModal && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.82)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 640, margin: 'auto', padding: 28 }}>
            {/* Modal Header */}
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><Layers /> {t('shopOnboarding')}</span>
                <h2 style={{ fontSize: 19 }}>{t('provisionNewShopWorkspace')}</h2>
              </div>
              <button onClick={() => { resetAddForm(); setShowAddModal(false); }} className="icon-btn">
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
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Store /></div><b>{t('shopNameLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="text" required value={shopName} onChange={(e) => setShopName(e.target.value)}
                      placeholder={t('shopNamePlaceholder')}
                    />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label">
                    <div className="reg-ico" style={{ background: 'var(--pink)' }}><MapPin /></div>
                    <b>{t('shopAddressLabel')} <span className="req">*</span></b>
                    <button
                      type="button" onClick={captureProvisionLocation} disabled={provisionLocLoading}
                      className="reg-trailing loc-btn"
                    >
                      <Crosshair className={provisionLocLoading ? 'animate-spin' : ''} />
                      <span>{provisionLocLoading ? t('locatingLabel') : t('currentLocationBtn')}</span>
                    </button>
                  </div>
                  <div className="input-wrap">
                    <input
                      type="text" required value={provisionLocation} onChange={(e) => setProvisionLocation(e.target.value)}
                      placeholder={t('shopAddressPlaceholder')}
                    />
                  </div>
                  {provisionLocError && (
                    <p style={{ marginTop: 6, fontSize: 11, color: 'var(--amber)', fontWeight: 700 }}>{provisionLocError}</p>
                  )}
                </div>
              </div>

              <div className="reg-section">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><User /></div><b>{t('adminFullNameLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="text" required value={adminName} onChange={(e) => setAdminName(e.target.value)}
                      placeholder={t('adminFullNamePlaceholder')}
                    />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Mail /></div><b>{t('adminEmailLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="email" required value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder={t('adminEmailPlaceholder')}
                    />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><Lock /></div><b>{t('initialPasswordLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="password" required value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder={t('initialPasswordPlaceholder')}
                    />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Phone /></div><b>{t('fieldPhone')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="tel" required value={provisionPhone} onChange={(e) => setProvisionPhone(e.target.value)}
                      placeholder={t('phonePlaceholder')}
                    />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label">
                    <div className="reg-ico" style={{ background: 'var(--rose)' }}><Phone /></div>
                    <b>{t('whatsappNumberLabel')} <span className="req">*</span></b>
                    <label className="reg-trailing">
                      <input
                        type="checkbox" checked={provisionSameAsPhone}
                        onChange={(e) => {
                          setProvisionSameAsPhone(e.target.checked);
                          if (e.target.checked) setProvisionWhatsapp(provisionPhone);
                        }}
                        style={{ accentColor: 'var(--gold)', width: 13, height: 13 }}
                      />
                      <span>{t('sameAsPhone')}</span>
                    </label>
                  </div>
                  <div className="input-wrap">
                    <input
                      type="tel" required value={provisionWhatsapp} onChange={(e) => setProvisionWhatsapp(e.target.value)}
                      disabled={provisionSameAsPhone} placeholder={t('whatsappNumberLabel')}
                      style={{ opacity: provisionSameAsPhone ? 0.5 : 1 }}
                    />
                  </div>
                </div>
              </div>

              <div className="reg-section">
                <div className="form-grid">
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><DollarSign /></div><b>{t('subscriptionPlanLabel')}</b></div>
                    <div style={{ width: '100%', background: 'var(--card-2)', border: '1.5px solid var(--border-2)', color: 'var(--text-1)', borderRadius: 13, padding: '13px 15px', fontSize: 14, fontWeight: 700 }}>
                      {t('yearlyPlan')} • Rs. {subscriptionPrice}/yr
                    </div>
                  </div>
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><Calendar /></div><b>{t('endDateValidityLabel')} <span className="req">*</span></b></div>
                    <input
                      type="date" required value={subEndDate} disabled
                      style={{ width: '100%', background: 'var(--card-2)', opacity: 0.6, border: '1.5px solid var(--border-2)', color: 'var(--text-2)', borderRadius: 13, padding: '13px 15px', fontSize: 14, outline: 'none', cursor: 'not-allowed' }}
                    />
                    <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>{t('autoCalculatedTier')}</span>
                  </div>
                </div>
              </div>

              <div className="reg-section">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <div className="reg-field-label" style={{ marginBottom: 6 }}><div className="reg-ico" style={{ background: 'var(--purple)' }}><Camera /></div><b>{t('shopPhotoLabel')} <span className="req">*</span></b></div>
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
                    <div className="reg-field-label" style={{ marginBottom: 6 }}><div className="reg-ico" style={{ background: 'var(--pink)' }}><FileText /></div><b>{t('shopLicenseLabel')} <span className="req">*</span></b></div>
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
                    <div className="reg-field-label" style={{ marginBottom: 6 }}><div className="reg-ico" style={{ background: 'var(--blue)' }}><CreditCard /></div><b>{t('ownerAadhaarLabel')} <span className="req">*</span></b></div>
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
                  type="button" onClick={() => { resetAddForm(); setShowAddModal(false); }}
                  className="btn btn-ghost"
                >
                  {t('btnCancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  {t('provisionAccountBtn')}
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
                <span className="eyebrow" style={{ marginBottom: 4 }}><Settings /> {t('workspaceSettings')}</span>
                <h2 style={{ fontSize: 19 }}>{t('editShopWorkspaceDetails')}</h2>
              </div>
              <button onClick={() => setShowEditModal(false)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleEditShopSubmit}>
              <div className="reg-section">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Store /></div><b>{t('workspaceNameLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="text" required value={editName} onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="reg-section">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Phone /></div><b>{t('fieldPhone')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="tel" required value={editPhone} onChange={(e) => setEditPhone(e.target.value)}
                    />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><MapPin /></div><b>{t('registeredAddressFixed')}</b></div>
                  <div className="input-wrap">
                    <input
                      type="text" readOnly value={editAddress}
                      style={{ opacity: 0.6, cursor: 'not-allowed' }}
                    />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Percent /></div><b>{t('fieldGstNumber')}</b></div>
                  <div className="input-wrap">
                    <input
                      type="text" value={editGst} onChange={(e) => setEditGst(e.target.value)}
                      placeholder="Pending"
                    />
                  </div>
                </div>
              </div>

              <div className="reg-section">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Shop Photo */}
                  <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 10, borderRadius: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <span style={{ fontSize: 9, color: 'var(--purple)', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, textTransform: 'uppercase' }}><Camera style={{ width: 11, height: 11 }} /> {t('shopPhotoLabel')}</span>
                      {editShopPhoto ? (
                        <div style={{ marginTop: 6, height: 56, width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-2)', background: '#000' }}>
                          <img src={getAssetUrl(editShopPhoto)} className="w-full h-full object-cover" alt="Shop Photo Preview" />
                        </div>
                      ) : (
                        <span style={{ fontSize: 9, color: 'var(--text-3)', fontStyle: 'italic', display: 'block', marginTop: 6 }}>{t('notUploaded')}</span>
                      )}
                    </div>
                    {editShopPhoto && (
                      <button
                        type="button"
                        onClick={() => downloadAsset(editShopPhoto, editShopPhotoName || filenameForAsset(editShopPhoto, 'shop_photo'))}
                        className="btn btn-primary btn-sm btn-block"
                        style={{ fontSize: 9, padding: '6px 10px' }}
                      >
                        {t('btnDownload')}
                      </button>
                    )}
                  </div>

                  {/* Shop License */}
                  <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 10, borderRadius: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <span style={{ fontSize: 9, color: 'var(--pink)', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, textTransform: 'uppercase' }}><FileText style={{ width: 11, height: 11 }} /> {t('shopLicenseLabel')}</span>
                      {editShopLicense ? (
                        <div style={{ marginTop: 6, height: 56, width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-2)', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {(editShopLicense.startsWith('data:application/pdf') || editShopLicense.toLowerCase().endsWith('.pdf')) ? (
                            <FileText style={{ width: 20, height: 20, color: 'var(--red)' }} />
                          ) : (
                            <img src={getAssetUrl(editShopLicense)} className="w-full h-full object-cover" alt="License Preview" />
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: 9, color: 'var(--text-3)', fontStyle: 'italic', display: 'block', marginTop: 6 }}>{t('notUploaded')}</span>
                      )}
                    </div>
                    {editShopLicense && (
                      <button
                        type="button"
                        onClick={() => downloadAsset(editShopLicense, editShopLicenseName || filenameForAsset(editShopLicense, 'shop_license'))}
                        className="btn btn-primary btn-sm btn-block"
                        style={{ fontSize: 9, padding: '6px 10px' }}
                      >
                        {t('btnDownload')}
                      </button>
                    )}
                  </div>

                  {/* Owner Aadhaar */}
                  <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 10, borderRadius: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <span style={{ fontSize: 9, color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, textTransform: 'uppercase' }}><CreditCard style={{ width: 11, height: 11 }} /> {t('ownerAadhaarLabel')}</span>
                      {editOwnerAadhaar ? (
                        <div style={{ marginTop: 6, height: 56, width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-2)', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {(editOwnerAadhaar.startsWith('data:application/pdf') || editOwnerAadhaar.toLowerCase().endsWith('.pdf')) ? (
                            <FileText style={{ width: 20, height: 20, color: 'var(--red)' }} />
                          ) : (
                            <img src={getAssetUrl(editOwnerAadhaar)} className="w-full h-full object-cover" alt="Aadhaar Preview" />
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: 9, color: 'var(--text-3)', fontStyle: 'italic', display: 'block', marginTop: 6 }}>{t('notUploaded')}</span>
                      )}
                    </div>
                    {editOwnerAadhaar && (
                      <button
                        type="button"
                        onClick={() => downloadAsset(editOwnerAadhaar, editOwnerAadhaarName || filenameForAsset(editOwnerAadhaar, 'owner_aadhaar'))}
                        className="btn btn-primary btn-sm btn-block"
                        style={{ fontSize: 9, padding: '6px 10px' }}
                      >
                        {t('btnDownload')}
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
                  {t('btnCancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  {t('saveSettings')}
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
                <span className="eyebrow" style={{ marginBottom: 4 }}><DollarSign /> {t('billingEyebrow')}</span>
                <h2 style={{ fontSize: 19 }}>{t('updateShopSubscriptionTitle')}</h2>
              </div>
              <button onClick={() => setShowSubModal(false)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, background: 'var(--card-2)', padding: 12, borderRadius: 13, border: '1px solid var(--border-2)', marginBottom: 18 }}>
              {t('targetShopLabel')} <span style={{ fontWeight: 800, color: 'var(--gold)' }}>{selectedShop.name}</span>
            </div>

            <form onSubmit={handleUpdateSubscriptionSubmit}>
              <div className="reg-section">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><DollarSign /></div><b>{t('planTierLabel')}</b></div>
                  <div style={{ width: '100%', background: 'var(--card-2)', border: '1.5px solid var(--border-2)', color: 'var(--text-1)', borderRadius: 13, padding: '13px 15px', fontSize: 14, fontWeight: 700 }}>
                    {t('yearlyPlanFull')} • Rs. {subscriptionPrice}/yr
                  </div>
                </div>

                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><Calendar /></div><b>{t('newEndDateLabel')}</b></div>
                  <input
                    type="date" readOnly
                    value={(() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); })()}
                    style={{ width: '100%', background: 'var(--card-2)', opacity: 0.6, border: '1.5px solid var(--border-2)', color: 'var(--text-2)', borderRadius: 13, padding: '13px 15px', fontSize: 14, outline: 'none', cursor: 'not-allowed' }}
                  />
                  <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>{t('autoCalculatedTier')}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
                <button
                  type="button" onClick={() => setShowSubModal(false)}
                  className="btn btn-ghost"
                >
                  {t('btnCancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  {t('updatePlanBtn')}
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
                  <h2 style={{ fontSize: 14 }}>{t('planSubscriptionEscrowPay')}</h2>
                  <p style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600, marginTop: 2 }}>{t('workspaceTerminalProvisioningPayment')}</p>
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
                  <h3 style={{ fontSize: 18 }}>{t('paymentAuthorizedTitle')}</h3>
                  <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, maxWidth: 320, margin: '8px auto 0' }}>
                    {t('paymentSettledDesc').split('{name}')[0]}<strong style={{ color: 'var(--text-1)' }}>{provisionDto.name}</strong>{t('paymentSettledDesc').split('{name}')[1]}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowPaymentProvisionModal(false);
                  }}
                  className="btn btn-primary btn-block"
                >
                  {t('closeAndProceedBtn')}
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
                  <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.05em' }}>{t('processingTransactionTitle')}</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, marginTop: 4 }}>{t('finalizingWorkspaceCreation')}</p>
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
                    <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', display: 'block', fontWeight: 700 }}>{t('workspaceProvisionInvoice')}</span>
                    <span style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 600 }}>{t('planColonLabel')} <span style={{ fontWeight: 800, color: 'var(--gold)' }}>{t('yearlyPlan')}</span></span>
                  </div>
                  <span style={{ fontSize: 21, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--display)' }}>Rs. {subscriptionPrice}</span>
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
                    <span style={{ fontSize: 10 }}>{t('creditCardLabel')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('upi')}
                    className={`store-tab ${paymentMethod === 'upi' ? 'active' : ''}`}
                    style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 8px' }}
                  >
                    <QrCode className="h-4 w-4" />
                    <span style={{ fontSize: 10 }}>{t('upiQrCodeLabel')}</span>
                  </button>
                </div>

                {paymentMethod === 'card' ? (
                  <div className="animate-fade-in">
                    <div className="field">
                      <label>{t('cardholderFullNameLabel')}</label>
                      <div className="input-wrap">
                        <User />
                        <input
                          type="text" required value={cardHolder} onChange={(e) => setCardHolder(e.target.value)}
                          placeholder={t('cardholderNamePlaceholder')}
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label>{t('debitCreditCardNumberLabel')}</label>
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
                        <label>{t('expiryDateLabel')}</label>
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
                        <label>{t('cvvCodeLabel')}</label>
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
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${KEE_LANDING_PAGE_URL}/subscribe?amount=${subscriptionPrice}`}
                        alt="Pay QR code"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div>
                      <p style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 700 }}>{t('scanToAuthorizeInvoice')}</p>
                      <p style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600, maxWidth: 260, marginTop: 4 }}>
                        {t('scanQrDesc')}
                      </p>
                    </div>
                  </div>
                )}

                {/* Footer buttons */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
                  <div className="flex items-center gap-1.5 justify-center" style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600, marginBottom: 14 }}>
                    <Lock className="h-3 w-3" style={{ color: 'var(--green)' }} />
                    <span>{t('secureGatewayPaymentPortal')}</span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPaymentProvisionModal(false)}
                      className="btn btn-ghost"
                      style={{ flex: 1 }}
                    >
                      {t('cancelSetupBtn')}
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ flex: 2 }}
                    >
                      {t('payAndProvisionPrefix')} {subscriptionPrice} {t('payAndProvisionSuffix')}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Full Shop Settings modal - lets Super Admin manage a specific
          shop's GST/verification document/referral code, reusing the exact
          same view (scoped via shopId) the Shop Admin sees on their own
          dashboard. */}
      {fullSettingsShopId && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.82)' }}>
          <div style={{ width: '100%', maxWidth: 900, margin: 'auto' }}>
            <div className="flex justify-end" style={{ marginBottom: 10 }}>
              <button onClick={() => setFullSettingsShopId(null)} className="icon-btn" style={{ background: 'var(--card)' }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <ShopSettingsView t={t} api={api} shopId={fullSettingsShopId} />
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
// Page size for the Customer Registry's cursor pagination - see
// CustomerService.getSuperCustomers.
const CUSTOMER_REGISTRY_PAGE_SIZE = 20;

// Caches only the first page of the default (no-search) list - module
// scope, same rationale as shopsFirstPageCache above.
let customersFirstPageCache = null;

function SuperCustomersView({ t, api, searchDispatch }) {
  const { user } = useAuth();
  const [customers, setCustomers] = useState(customersFirstPageCache ? customersFirstPageCache.items : []);
  const [loading, setLoading] = useState(false);
  // Infinite-scroll pagination state - `customers` only ever holds the pages
  // loaded so far, never the whole platform-wide registry.
  const [nextCursor, setNextCursor] = useState(customersFirstPageCache ? customersFirstPageCache.nextCursor : null);
  const [hasMore, setHasMore] = useState(customersFirstPageCache ? customersFirstPageCache.hasMore : false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef(null);
  const [search, setSearch] = useState('');
  // Debounced before it reaches the server - see PromotionsFeed's identical
  // pattern for why (every change now triggers a network request instead of
  // filtering an already-fully-loaded list).
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

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
  const [fullEditCust, setFullEditCust] = useState(null);
  useBackHandler(showCreateWizard, () => setShowCreateWizard(false));
  useBackHandler(!!fullEditCust, () => setFullEditCust(null));

  // Loads the first page for the current search, replacing whatever was
  // loaded before.
  const fetchCustomers = async () => {
    // Only blank to a spinner for a real search or a genuinely empty
    // screen - a bare revisit renders the cached first page instantly and
    // refreshes silently in the background.
    if (debouncedSearch || customers.length === 0) setLoading(true);
    try {
      const res = await api.getSuperCustomersPage({ search: debouncedSearch, limit: CUSTOMER_REGISTRY_PAGE_SIZE });
      setCustomers(res.items);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
      if (!debouncedSearch) {
        customersFirstPageCache = { items: res.items, nextCursor: res.nextCursor, hasMore: !!res.nextCursor };
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Appends the next page - triggered by the sentinel scrolling into view or
  // the manual "Load More" fallback button.
  const fetchMoreCustomers = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.getSuperCustomersPage({ search: debouncedSearch, cursor: nextCursor, limit: CUSTOMER_REGISTRY_PAGE_SIZE });
      setCustomers((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [debouncedSearch]);

  useEffect(() => {
    const node = loadMoreSentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchMoreCustomers();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, nextCursor, loadingMore, debouncedSearch]);

  const openCreateWizard = async () => {
    setShowCreateWizard(true);
    // Shows the cached platform shop list instantly if we have one (shared
    // with AdsManagementView's cache - shops rarely change) while
    // refreshing in the background, instead of the wizard's shop-selector
    // always waiting on a fresh full-table fetch before it's usable.
    if (platformShopsCache) setShops(platformShopsCache);
    try {
      const res = await api.getShops();
      setShops(res || []);
      platformShopsCache = res || [];
    } catch (e) {
      console.error(e);
    }
  };

  const [reportBusyId, setReportBusyId] = useState(null);

  const getFullShopDetails = async (c) => {
    let name = c.shop?.name || 'Key Shops';
    let address = 'N/A';
    let phone = 'N/A';
    try {
      const shopsRes = await api.getShops();
      const found = (shopsRes || []).find(s => s.id === c.shopId || s.name === c.shop?.name);
      if (found) {
        name = found.name || name;
        if (found.companyDetails) {
          try {
            const details = typeof found.companyDetails === 'string' ? JSON.parse(found.companyDetails) : found.companyDetails;
            address = details.address || found.address || 'N/A';
            phone = details.phone || found.phone || 'N/A';
          } catch (e) {
            address = found.address || 'N/A';
            phone = found.phone || 'N/A';
          }
        } else {
          address = found.address || 'N/A';
          phone = found.phone || 'N/A';
        }
      }
    } catch (e) {
      console.warn('Could not fetch shop details for report:', e);
    }
    return { name, address, phone };
  };

  const handleDownloadCustomerReport = async (c) => {
    setReportBusyId(`${c.id}:download`);
    try {
      const shopRes = await getFullShopDetails(c);
      const { buildCustomerReportPdf } = await import('./utils/customerReportPdf');
      const pdf = await buildCustomerReportPdf({ customer: c, shop: shopRes, registeredByName: c.registeredByName || user?.name || 'Key Shops' });
      const safeName = `${(c.name || 'Customer').trim().replace(/[^a-zA-Z0-9_\-\s]+/g, '').replace(/\s+/g, '_')}.pdf`;
      await downloadPdf(pdf, safeName);
    } catch (err) {
      console.error('Failed to generate customer report PDF:', err);
      window.alert('Could not generate the report PDF. Please try again.');
    } finally {
      setReportBusyId(null);
    }
  };

  const handleShareCustomerReportViaWhatsApp = async (c) => {
    setReportBusyId(`${c.id}:whatsapp`);
    try {
      const shopRes = await getFullShopDetails(c);
      const { buildCustomerReportPdf } = await import('./utils/customerReportPdf');
      const pdf = await buildCustomerReportPdf({ customer: c, shop: shopRes, registeredByName: c.registeredByName || user?.name || 'Key Shops' });
      const { shareCustomerReportViaWhatsApp } = await import('./utils/reportShare');
      await shareCustomerReportViaWhatsApp({ api, pdf, customer: c });
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        console.error('Failed to share customer report PDF:', err);
        window.alert('Could not share the report PDF. Please try again.');
      }
    } finally {
      setReportBusyId(null);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><ShieldCheck /> {t('crossTenantCompliance')}</div>
          <h1>{t('customerRegistryTitle')}</h1>
          <p>{t('superviseComplianceRecordsDesc')}</p>
        </div>
      </div>

      {/* Portaled to escape .animate-fade-in's permanent transform (fill-mode
          forwards) - see ShopsManagementView's identical FAB for why. */}
      {createPortal(
        <button
          type="button"
          onClick={openCreateWizard}
          className="fab"
          aria-label={t('createCustomerBtn')}
          title={t('createCustomerBtn')}
        >
          <Plus />
        </button>,
        document.body
      )}

      {/* The search box lives outside the loading/results swap below so it
          never unmounts while typing - every keystroke sets `search`, which
          re-triggers the fetch and flips `loading` briefly, but the input
          itself stays mounted throughout and keeps focus the whole time. */}
      <div className="card table-card">
        <div className="table-head">
          <h2 style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 17 }}>
            {t('allCustomers')} <span style={{ color: 'var(--text-3)', fontWeight: 700, fontSize: 13 }}>({customers.length})</span>
          </h2>
          <div className="search-box">
            <Search />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchByNamePhoneKeyCode')}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 200 }}>
            <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingCustomerRegistry')}</span>
          </div>
        ) : customers.length === 0 ? (
          <p style={{ padding: 24, fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>
            {t('noCustomerRecordsMatch')}
          </p>
        ) : (
          <div className="stagger-in" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px' }}>
            {customers.map(c => {
              const keyCode = c.keyNumber || (c.keys?.[0]?.keyNumber) || '—';
              const shopName = c.shop ? c.shop.name : (t('shopWorkspaceFallback') || 'Unassigned Workspace');
              const fullLoc = c.capturedAddress || c.address || 'N/A';

              return (
                <div
                  key={c.id}
                  className="card"
                  style={{
                    background: 'var(--card-1, #ffffff)',
                    border: '1.5px solid var(--border-2)',
                    borderRadius: 18,
                    padding: '20px 22px',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  {/* Card Header: Icon Badge + Customer Name + Shop */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div className="icon-badge purple" style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0 }}>
                      <User style={{ width: 19, height: 19 }} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-0)', fontFamily: 'var(--display)' }}>{c.name}</div>
                      {shopName && (
                        <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <Store style={{ width: 12, height: 12, color: 'var(--gold)' }} />
                          <span>{shopName}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Customer Details Grid (Key-Value pairs matching Customer History) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, fontWeight: 700 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        {t('phoneCol') || 'PHONE'}
                      </span>
                      <span style={{ color: 'var(--text-0)', fontWeight: 700 }}>{c.phone || 'N/A'}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        {t('vehicleCol') || 'VEHICLE'}
                      </span>
                      <span style={{ color: 'var(--text-0)', fontWeight: 700 }}>{c.vehicleNumber || c.vehicleName || 'N/A'}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        {t('keyCodeCol') || 'KEY CODE'}
                      </span>
                      <span className="badge badge-active" style={{ fontSize: 12, padding: '3px 10px' }}>
                        <span className="dot" />{keyCode}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                      <span style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', flexShrink: 0, marginTop: 2 }}>
                        {t('locationCol') || 'LOCATION'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, textAlign: 'right', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.4, color: 'var(--text-0)', fontWeight: 600, fontSize: 12.5, maxWidth: '75%' }}>
                        <MapPin style={{ width: 14, height: 14, color: 'var(--green)', flexShrink: 0, marginTop: 2 }} />
                        <span>{fullLoc}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        {t('loggedCol') || 'LOGGED'}
                      </span>
                      <span style={{ color: 'var(--text-0)', fontWeight: 700 }}>{new Date(c.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div style={{ borderTop: '1px solid var(--border-2)', paddingTop: 14, marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                      {t('actionsCol') || 'ACTIONS'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setViewCust(c)}
                        className="icon-btn"
                        style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--card-2)', color: 'var(--text-1)' }}
                        title={t('viewComplianceFile') || 'View File'}
                      >
                        <Eye style={{ width: 16, height: 16 }} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadCustomerReport(c)}
                        disabled={reportBusyId === `${c.id}:download`}
                        className="icon-btn"
                        style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--card-2)', color: 'var(--text-1)' }}
                        title={t('downloadReportBtn') || 'Download Report'}
                      >
                        {reportBusyId === `${c.id}:download` ? <RefreshCw className="animate-spin" style={{ width: 15, height: 15 }} /> : <Download style={{ width: 16, height: 16 }} />}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleShareCustomerReportViaWhatsApp(c)}
                        disabled={reportBusyId === `${c.id}:whatsapp`}
                        className="icon-btn"
                        style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--card-2)', color: '#25D366' }}
                        title={t('shareViaWhatsAppBtn') || 'Share via WhatsApp'}
                      >
                        {reportBusyId === `${c.id}:whatsapp` ? <RefreshCw className="animate-spin" style={{ width: 15, height: 15 }} /> : (
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /><path d="M12.004 2C6.486 2 2 6.486 2 12.004c0 1.85.505 3.649 1.462 5.207L2 22l4.933-1.437a9.96 9.96 0 0 0 5.071 1.39h.004c5.518 0 10.004-4.486 10.004-10.005C22.012 6.486 17.522 2 12.004 2zm0 18.155h-.003a8.14 8.14 0 0 1-4.153-1.14l-.298-.177-3.09.9.918-3.02-.194-.309a8.13 8.13 0 0 1-1.257-4.405c0-4.494 3.657-8.15 8.156-8.15 2.178 0 4.225.85 5.766 2.393a8.096 8.096 0 0 1 2.386 5.762c-.002 4.494-3.658 8.15-8.156 8.15z" /></svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Infinite scroll (sentinel) + manual "Load More" fallback - see
            PromotionsFeed's identical pattern for why both exist. */}
        {!loading && hasMore && (
          <div ref={loadMoreSentinelRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 20 }}>
            {loadingMore ? (
              <RefreshCw className="animate-spin" style={{ width: 20, height: 20, color: 'var(--gold)' }} />
            ) : (
              <button type="button" onClick={fetchMoreCustomers} className="btn btn-outline btn-sm">
                {t('loadMoreBtn')}
              </button>
            )}
          </div>
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
                <span className="eyebrow" style={{ marginBottom: 4 }}><FileText /> {t('complianceFileEyebrow')}</span>
                <h2 style={{ fontSize: 19 }}>{viewCust.name}</h2>
              </div>
              <button onClick={() => setViewCust(null)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="reg-section">
              <div className="grid grid-cols-2 gap-4">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Phone /></div><b>{t('phoneContactLabel')}</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{viewCust.phone}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Calendar /></div><b>{t('registryDateLabel')}</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{new Date(viewCust.createdAt).toLocaleString()}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><Home /></div><b>{t('addressLabel')}</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }} className="block truncate">{viewCust.address}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><KeyRound /></div><b>{t('keyBlankCodeLabel')}</b></div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="badge badge-active"><span className="dot" />{viewCust.keyNumber}</span>
                    {viewCust.keyType && <span className="badge" style={{ background: 'var(--purple-dim, rgba(124,77,255,0.12))', color: 'var(--purple)' }}>{viewCust.keyType}</span>}
                  </div>
                </div>
              </div>
            </div>

            <div className="reg-section">
              <div className="grid grid-cols-2 gap-4">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Fingerprint /></div><b>{t('idVerificationLabel')}</b></div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{viewCust.idProofType}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><Lock /></div><b>{t('idNumberDecryptedLabel')}</b></div>
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
                      <p style={{ fontWeight: 700, color: 'var(--text-0)', fontSize: 13 }}>{t('gpsCoordinatesLabel')}</p>
                      {viewCust.latitude && viewCust.longitude ? (
                        <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, fontWeight: 600 }}>{t('latLongTemplate').split('{lat}')[0]}{viewCust.latitude}{t('latLongTemplate').split('{lat}')[1].split('{long}')[0]}{viewCust.longitude}</p>
                      ) : (
                        <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, fontWeight: 600, fontStyle: 'italic' }}>{t('notCapturedLabel')}</p>
                      )}
                    </div>
                  </div>
                  {viewCust.mapsLink && (
                    <a href={viewCust.mapsLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10.5, color: 'var(--gold)', fontWeight: 800 }} className="flex items-center gap-1 hover:underline">
                      <span>{t('googleMapsLabel')}</span><ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                {viewCust.capturedAddress && (
                  <div style={{ fontSize: 10.5, color: 'var(--text-2)', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8, paddingLeft: 42, fontWeight: 600 }}>
                    <span style={{ display: 'block', fontWeight: 800, fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase' }}>{t('capturedAddressLabel')}</span>
                    <span>{viewCust.capturedAddress}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="reg-section" style={{ marginBottom: 0 }}>
              <div className="reg-field">
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Camera /></div><b>{t('webcamPhotoLabel')}</b></div>
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
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><FileCheck /></div><b>{t('attachedIdCopiesLabel')}</b></div>
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
                          {uploaded ? t('uploadedBadge') : t('missingBadge')}
                        </span>
                        <button
                          type="button"
                          title={t('btnDownload')}
                          aria-label={t('btnDownload')}
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

            <div className="flex justify-between items-center flex-wrap gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const shopRes = await getFullShopDetails(viewCust);
                      const { buildCustomerReportPdf } = await import('./utils/customerReportPdf');
                      const pdf = await buildCustomerReportPdf({ customer: viewCust, shop: shopRes, registeredByName: viewCust.registeredByName || user?.name || 'Key Shops' });
                      const safeName = `${(viewCust.name || 'Customer').trim().replace(/[^a-zA-Z0-9_\-\s]+/g, '').replace(/\s+/g, '_')}.pdf`;
                      await downloadPdf(pdf, safeName);
                    } catch (e) {
                      console.error(e);
                      alert('Could not download document PDF.');
                    }
                  }}
                  className="btn btn-outline btn-sm"
                >
                  <Download className="h-4 w-4" />
                  <span>Download Document</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const shopRes = await getFullShopDetails(viewCust);
                      const { buildCustomerReportPdf } = await import('./utils/customerReportPdf');
                      const pdf = await buildCustomerReportPdf({ customer: viewCust, shop: shopRes, registeredByName: viewCust.registeredByName || user?.name || 'Key Shops' });
                      const { shareCustomerReportViaWhatsApp } = await import('./utils/reportShare');
                      await shareCustomerReportViaWhatsApp({ api, pdf, customer: viewCust });
                    } catch (e) {
                      if (e && e.name !== 'AbortError') {
                        console.error(e);
                        alert('Could not share document via WhatsApp.');
                      }
                    }
                  }}
                  className="btn btn-primary btn-sm"
                  style={{ background: '#25D366', borderColor: '#25D366' }}
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>Share WhatsApp</span>
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFullEditCust(viewCust)}
                  className="btn btn-primary btn-sm"
                >
                  <Edit className="h-4 w-4" />
                  <span>{t('editDetailsBtn')}</span>
                </button>
                <button onClick={() => setViewCust(null)} className="btn btn-ghost">{t('closeFileBtn')}</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {fullEditCust && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'var(--bg-0, #0b0a09)' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px 60px' }}>
            <CustomerRegistrationWizard
              t={t}
              api={api}
              superAdminMode
              shops={shops}
              editCustomer={fullEditCust}
              onCancel={() => setFullEditCust(null)}
              onDone={(updated) => {
                setFullEditCust(null);
                if (viewCust && updated) setViewCust(updated);
                fetchCustomers();
              }}
            />
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
// Page size for the Master Catalogue's cursor pagination - see
// KeyService.getKeys.
const KEY_CATALOGUE_PAGE_SIZE = 20;

// Caches only the first page of the default (no-search) list - module
// scope, same rationale as shopsFirstPageCache above.
let keysFirstPageCache = null;

// Maps a Customer.vehicleCategory value to its existing display label -
// shared shape with KeysSearchView's identical need below.
function keyTypeDisplayLabel(t, vehicleCategory) {
  switch (vehicleCategory) {
    case VEHICLE_CATEGORIES.TWO_WHEELER: return t('twoWheelerLabel');
    case VEHICLE_CATEGORIES.FOUR_WHEELER: return t('fourWheelerLabel');
    case VEHICLE_CATEGORIES.TRUCK_LORRY: return t('truckLorryLabel');
    case VEHICLE_CATEGORIES.HOME: return t('homeCategoryLabel');
    case VEHICLE_CATEGORIES.OFFICE: return t('officeCategoryLabel');
    default: return null;
  }
}

function KeysCatalogView({ t, api, searchDispatch }) {
  const [keys, setKeys] = useState(keysFirstPageCache ? keysFirstPageCache.items : []);
  const [loading, setLoading] = useState(!keysFirstPageCache);
  // Infinite-scroll pagination state - `keys` only ever holds the pages
  // loaded so far, never the whole platform-wide catalog.
  const [nextCursor, setNextCursor] = useState(keysFirstPageCache ? keysFirstPageCache.nextCursor : null);
  const [hasMore, setHasMore] = useState(keysFirstPageCache ? keysFirstPageCache.hasMore : false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Debounced before it reaches the server - see PromotionsFeed's identical
  // pattern for why (every change now triggers a network request instead of
  // filtering an already-fully-loaded list).
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  // Picks up a query dispatched from the global header search panel (filter = "Key").
  useEffect(() => {
    if (searchDispatch && searchDispatch.type === 'key') {
      setSearchQuery(searchDispatch.query);
    }
  }, [searchDispatch?.nonce]);

  // Loads the first page for the current search, replacing whatever was
  // loaded before.
  const fetchKeys = async () => {
    // Only blank to a spinner for a real search or a genuinely empty
    // screen - a bare revisit renders the cached first page instantly and
    // refreshes silently in the background.
    if (debouncedSearchQuery || keys.length === 0) setLoading(true);
    try {
      const res = await api.getSuperKeysCatalogue({ search: debouncedSearchQuery, limit: KEY_CATALOGUE_PAGE_SIZE });
      setKeys(res.items);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
      if (!debouncedSearchQuery) {
        keysFirstPageCache = { items: res.items, nextCursor: res.nextCursor, hasMore: !!res.nextCursor };
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Appends the next page - triggered by the sentinel scrolling into view or
  // the manual "Load More" fallback button.
  const fetchMoreKeys = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.getSuperKeysCatalogue({ search: debouncedSearchQuery, cursor: nextCursor, limit: KEY_CATALOGUE_PAGE_SIZE });
      setKeys((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, [debouncedSearchQuery]);

  useEffect(() => {
    const node = loadMoreSentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchMoreKeys();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, nextCursor, loadingMore, debouncedSearchQuery]);

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Key /> {t('platformCatalogueLabel')}</div>
          <h1>{t('masterKeyCatalogueTitle')}</h1>
          <p>{t('registeredKeysAcrossShopsDesc')}</p>
        </div>
      </div>

      {/* Central catalog lookup search input */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', padding: 0, marginBottom: 24 }}>
        <div className="search-box" style={{ width: '100%', minWidth: 0, border: 'none', background: 'transparent', padding: '18px 22px' }}>
          <Search />
          <input
            type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchCataloguePlaceholder')}
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
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingCatalogueMsg')}</span>
        </div>
      ) : keys.length === 0 ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 220 }}>
          <div className="icon-badge maroon"><KeyRound /></div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{t('noRegisteredKeysMatch')}</span>
        </div>
      ) : (
        <div className="product-grid stagger-in">
          {keys.map((c) => {
            const typeLabel = keyTypeDisplayLabel(t, c.vehicleCategory);
            return (
              <div key={c.id} className="product-card">
                <div className="product-img" style={{ background: 'var(--maroon)' }}>
                  <KeyRound style={{ color: '#ffffff' }} />
                  <span className="product-tag">{c.addKey ? t('addKeyLabel') : c.lostKey ? t('lostKeyLabel') : t('registeredKeyLabel')}</span>
                </div>
                <div className="product-body">
                  <span className="pname">{c.keyNumber}</span>
                  <p className="pcat">{c.name}</p>
                  {typeLabel && (
                    <span className="badge" style={{ alignSelf: 'flex-start', background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                      {typeLabel}
                    </span>
                  )}
                  <div className="cell-sub" style={{ fontSize: 11 }}>
                    <Store className="h-3 w-3" style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                    {c.shop?.name || '—'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Infinite scroll (sentinel) + manual "Load More" fallback - see
          PromotionsFeed's identical pattern for why both exist. */}
      {!loading && hasMore && (
        <div ref={loadMoreSentinelRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 20 }}>
          {loadingMore ? (
            <RefreshCw className="animate-spin" style={{ width: 20, height: 20, color: 'var(--gold)' }} />
          ) : (
            <button type="button" onClick={fetchMoreKeys} className="btn btn-outline btn-sm">
              {t('loadMoreBtn')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// COMPONENT 6: ADVERTISEMENTS CRUD (SUPER ADMIN ONLY)
// ============================================================================
// In-memory caches (module scope) - the Banner/Offer Management sub-tab
// toggle unmounts/remounts this view on every click between "Banner
// Management" and "Offer Management", which admins do repeatedly in one
// visit, so without this every toggle blanked to a spinner and re-fetched
// both the ad list and the platform-wide shop dropdown from scratch. Shops
// list is also shared with the Create Customer wizard's shop-selector,
// which rarely needs the platform list to have changed since it was last
// fetched.
let adsListCache = null;
let platformShopsCache = null;

function AdsManagementView({ t, api }) {
  const [ads, setAds] = useState(adsListCache || []);
  const [shops, setShops] = useState(platformShopsCache || []);
  const [loading, setLoading] = useState(!adsListCache);
  const [showAddModal, setShowAddModal] = useState(false);
  useBackHandler(showAddModal, () => setShowAddModal(false));
  const [editingAdId, setEditingAdId] = useState(null);

  // Form states
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  // True only while a picked file is being resized+uploaded (see
  // handleImageFileSelect) - mirrors PromotionsFeed's identical pattern.
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState('');
  const [type, setType] = useState('BANNER');
  // Default both dates to today rather than leaving them blank - a fresh
  // campaign almost always starts today, and it saves having to open the
  // date picker just to set a sensible default.
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [priority, setPriority] = useState(0);
  const [targetAll, setTargetAll] = useState(true);
  const [targetShops, setTargetShops] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  // Resizes the picked file client-side, uploads it to real file storage,
  // and sets imageUrl to the returned URL - see PromotionsFeed's identical
  // handleImageFileSelect for the full rationale.
  const handleImageFileSelect = async (file) => {
    if (!file) return;
    setImageUploadError('');
    setImageUploading(true);
    try {
      const blob = await resizeImageFileToBlob(file);
      const { url } = await api.uploadAdImage(blob);
      setImageUrl(url);
    } catch (e) {
      console.error('Failed to upload banner image:', e);
      setImageUploadError(e.message || 'Failed to upload image');
    } finally {
      setImageUploading(false);
    }
  };

  useEffect(() => {
    fetchAds();
    fetchShops();
  }, []);

  const fetchAds = async () => {
    // Only blank to a spinner when there's nothing on screen yet - a
    // revisit renders the cached list instantly and refreshes silently.
    if (ads.length === 0) setLoading(true);
    try {
      const res = await api.getAdvertisements();
      setAds(res);
      adsListCache = res;
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
      platformShopsCache = res;
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
      setErrorMsg(err.message || (editingAdId ? t('failedUpdateCampaign') : t('failedScheduleCampaign')));
    }
  };

  const resetForm = () => {
    setEditingAdId(null);
    setTitle('');
    setImageUrl('');
    setImageUploadError('');
    setType('BANNER');
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate(new Date().toISOString().slice(0, 10));
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
    if (!confirm(t('confirmTerminateAdCampaign'))) return;
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
    if (type === 'POPUP') return { label: t('interactivePopupLabel'), icon: Sparkles };
    if (type === 'NOTICE') return { label: t('textNoticeLabel'), icon: Bell };
    if (type === 'APP_POSTER') return { label: t('appOpenPosterLabel'), icon: Smartphone };
    return { label: t('mainBannerLabel'), icon: Radio };
  };

  const isLive = (ad) => {
    const now = Date.now();
    return new Date(ad.startDate).getTime() <= now && new Date(ad.endDate).getTime() >= now;
  };

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Megaphone /> {t('growthMarketingLabel')}</div>
          <h1>{t('adCampaignsTitle')}</h1>
          <p>{t('publishBannersPopupsDesc')}</p>
        </div>
      </div>

      {/* Portaled to escape .animate-fade-in's permanent transform (fill-mode
          forwards) - see ShopsManagementView's identical FAB for why. */}
      {createPortal(
        <button
          type="button"
          onClick={() => { resetForm(); setShowAddModal(true); }}
          className="fab"
          aria-label={t('newAdCampaignBtn')}
          title={t('newAdCampaignBtn')}
        >
          <Plus />
        </button>,
        document.body
      )}

      {loading ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
          <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingCampaignsMsg')}</span>
        </div>
      ) : ads.length === 0 ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 220 }}>
          <div className="icon-badge"><Megaphone /></div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{t('noAdCampaignsScheduled')}</span>
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
                    <span className="dot" />{live ? t('liveLabel') : t('scheduledLabel')}
                  </span>
                </div>
                <div className="product-body">
                  <div className="flex items-center justify-between">
                    <span className="pname">{ad.title}</span>
                    <span className="badge badge-gold">{t('priorityLabel')} {ad.priority}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11, color: 'var(--text-2)', background: 'var(--card-2)', border: '1px solid var(--border)', padding: 10, borderRadius: 12, fontWeight: 600 }}>
                    <div>
                      <span style={{ color: 'var(--text-3)', display: 'block', fontWeight: 800, textTransform: 'uppercase', fontSize: 9.5, letterSpacing: '.04em' }}>{t('startLabel')}</span>
                      {new Date(ad.startDate).toLocaleDateString()}
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-3)', display: 'block', fontWeight: 800, textTransform: 'uppercase', fontSize: 9.5, letterSpacing: '.04em' }}>{t('endLabel')}</span>
                      {new Date(ad.endDate).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="cell-sub" style={{ fontSize: 11.5 }}>
                    <Users className="h-3 w-3" style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} />
                    {ad.targetAll ? t('allKeyShopsLabel') : (ad.targetShops.length === 1 ? t('targetedShopSingular').replace('{n}', ad.targetShops.length) : t('targetedShopsPlural').replace('{n}', ad.targetShops.length))}
                  </div>

                  <div className="flex gap-2" style={{ marginTop: 4 }}>
                    <button
                      onClick={() => handleEditClick(ad)}
                      className="btn btn-ghost btn-sm btn-block"
                      style={{ whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.2 }}
                    >
                      <Edit className="h-3.5 w-3.5" style={{ flexShrink: 0 }} />
                      <span>{t('editBtn')}</span>
                    </button>
                    <button
                      onClick={() => handleDelete(ad.id)}
                      className="btn btn-danger-outline btn-sm btn-block"
                      style={{ whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.2 }}
                    >
                      <Trash className="h-3.5 w-3.5" style={{ flexShrink: 0 }} />
                      <span>{t('cancelCampaignBtn')}</span>
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
                <span className="eyebrow" style={{ marginBottom: 4 }}><Radio /> {t('adCampaignLabel')}</span>
                <h2 style={{ fontSize: 19 }}>{editingAdId ? t('editAdCampaignTitle') : t('newVisualAdCampaignTitle')}</h2>
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
                <label>{t('adTitleAnnouncementLabel')}</label>
                <div className="input-wrap">
                  <Megaphone />
                  <input
                    type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('adTitlePlaceholderEg')}
                  />
                </div>
              </div>

              <div className="field">
                <label>{t('bannerImageSourceLabel')}</label>
                <label className="btn btn-ghost btn-sm" style={{ cursor: imageUploading ? 'default' : 'pointer', opacity: imageUploading ? 0.6 : 1 }}>
                  {imageUploading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  <span>{imageUploading ? t('uploadingLabel') : t('uploadBtn')}</span>
                  <input
                    type="file" accept="image/*" className="hidden" disabled={imageUploading}
                    onClick={primeStoragePermission}
                    onChange={(e) => {
                      const file = e.target.files[0];
                      e.target.value = '';
                      handleImageFileSelect(file);
                    }}
                  />
                </label>
                {imageUploadError && (
                  <p style={{ marginTop: 6, fontSize: 11, color: 'var(--rose)', fontWeight: 700 }}>{imageUploadError}</p>
                )}
                {imageUrl && (
                  <div style={{ marginTop: 10, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', height: 110, background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src={cleanGoogleImageUrl(imageUrl)} alt="Preview" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                  </div>
                )}
              </div>

              <div className="form-grid">
                <div className="field">
                  <label>{t('adFormatLabel')}</label>
                  <CustomSelect
                    value={type} onChange={setType}
                    options={[
                      { value: 'BANNER', label: t('mainBannerNoticeOption') },
                      { value: 'POPUP', label: t('interactiveLoginPopupOption') },
                      { value: 'APP_POSTER', label: t('appOpenPosterOption') },
                    ]}
                  />
                </div>
                <div className="field">
                  <label>{t('campaignPriorityLabel')}</label>
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
                  <label>{t('startDateLabel')}</label>
                  <div className="input-wrap">
                    <Calendar />
                    <input
                      type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="field">
                  <label>{t('endDateLabelShort')}</label>
                  <div className="input-wrap">
                    <CalendarRange />
                    <input
                      type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 4 }}>
                <label className="eyebrow" style={{ marginBottom: 10 }}><Users /> {t('targetAudienceLabel')}</label>
                <div className="flex gap-4 items-center" style={{ marginBottom: 10 }}>
                  <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 700 }}>
                    <input
                      type="radio" name="target" checked={targetAll} onChange={() => setTargetAll(true)}
                      style={{ accentColor: 'var(--gold)', width: 15, height: 15 }}
                    />
                    <span>{t('broadcastAllKeyShops')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 700 }}>
                    <input
                      type="radio" name="target" checked={!targetAll} onChange={() => setTargetAll(false)}
                      style={{ accentColor: 'var(--gold)', width: 15, height: 15 }}
                    />
                    <span>{t('targetSpecificShops')}</span>
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
                  {t('btnCancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={imageUploading}
                >
                  {editingAdId ? t('saveChangesBtn') : t('scheduleCampaignBtn')}
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

function PromotionsView({ t, api, user, searchDispatch, initiallyOpenAddModal, onCloseInitiallyOpen, defaultTown, locationReady }) {
  const isSuperAdmin = user.role === 'SUPER_ADMIN';

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Package /> {t('crossShopMarketplaceLabel')}</div>
          <h1>{t('inventoryTitle')}</h1>
          <p>
            {isSuperAdmin
              ? t('manageSharedInventoryDesc')
              : t('browseListProductsDesc')}
          </p>
        </div>
      </div>

      <PromotionsFeed
        key="feed" t={t} api={api} user={user} isSuperAdmin={isSuperAdmin} onlyOffers={false}
        searchDispatch={searchDispatch}
        initiallyOpenAddModal={initiallyOpenAddModal}
        onCloseInitiallyOpen={onCloseInitiallyOpen}
        defaultTown={defaultTown}
        locationReady={locationReady}
      />
    </div>
  );
}

// Page size for the Machines/Inventory feed's cursor pagination - see
// PromotionService.getAllPromotions.
const PROMOTIONS_PAGE_SIZE = 20;

// Machine/Product listings must expire and get auto-deleted within a month
// of creation (or a shorter admin-chosen date) - see PromotionService's
// backend enforcement of this same cap on create/update.
const PRODUCT_MAX_VALIDITY_DAYS = 30;

// Listing photo upload cap - see PromotionService's clampImageUrls for the
// matching backend-side enforcement.
const PRODUCT_MAX_PHOTOS = 4;

function PromotionsFeed({ t, api, user, isSuperAdmin, onlyOffers, searchDispatch, initiallyOpenAddModal, onCloseInitiallyOpen, defaultTown, locationReady }) {
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  // Infinite-scroll pagination state - `promotions` above only ever holds
  // the pages loaded so far, never the whole table (see fetchPromotions/
  // fetchMorePromotions below).
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef(null);
  const [showAddModal, setShowAddModal] = useState(false);
  useBackHandler(showAddModal, () => setShowAddModal(false));
  const [editingId, setEditingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Product Details navigation stack - tapping a product card pushes it;
  // tapping a Related Product on the details page pushes another level
  // (so hardware Back steps back through every product visited before
  // finally returning to this list), rather than replacing the current one.
  // One useBackHandler registration pops an arbitrary-depth stack one level
  // at a time (functional update avoids stale-closure issues) - same
  // pattern used by PublicMobileApp's screenStack.
  const [detailStack, setDetailStack] = useState([]);
  useBackHandler(detailStack.length > 0, () => setDetailStack((prev) => prev.slice(0, -1)));
  const pushDetail = (promo) => setDetailStack((prev) => [...prev, promo]);
  const popDetail = () => setDetailStack((prev) => prev.slice(0, -1));

  // Dashboard "Add Machines" quick action - open the create-listing dialog
  // as soon as this feed mounts, then let the parent clear the one-shot flag.
  useEffect(() => {
    if (initiallyOpenAddModal) {
      resetForm();
      setShowAddModal(true);
      onCloseInitiallyOpen?.();
    }
  }, [initiallyOpenAddModal]);

  // Form state
  const [type, setType] = useState('PRODUCT');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Up to PRODUCT_MAX_PHOTOS URLs, in display order. index 0 doubles as the
  // card-grid/PDF/legacy "cover photo" everywhere else in the app still
  // reads a single promo.imageUrl (see PromotionService syncing imageUrl to
  // imageUrls[0] on save) - no other display site needed to change.
  const [imageUrls, setImageUrls] = useState([]);
  // True only while a picked file is being resized+uploaded (see
  // handleImageFileSelect) - the Upload button is disabled meanwhile so a
  // second pick can't race the first.
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState('');
  const [price, setPrice] = useState('');
  const [productType, setProductType] = useState('');
  const [phone, setPhone] = useState('');
  const [discountPercentage, setDiscountPercentage] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [linkedPromotionId, setLinkedPromotionId] = useState('');

  // Resizes the picked file client-side, uploads it to real file storage,
  // and appends the returned URL to imageUrls (or overwrites `replaceIndex`
  // if given) - replaces the old FileReader base64-inline approach that was
  // embedding multi-MB photos directly in the database (see the "why is Used
  // Machines slow" investigation).
  const handleImageFileSelect = async (file, replaceIndex = null) => {
    if (!file) return;
    setImageUploadError('');
    setImageUploading(true);
    try {
      const blob = await resizeImageFileToBlob(file);
      const { url } = await api.uploadPromotionImage(blob);
      setImageUrls((prev) => {
        if (replaceIndex !== null) {
          const next = [...prev];
          next[replaceIndex] = url;
          return next;
        }
        // The Add-Photo tile is only rendered while prev.length < MAX, but
        // guard anyway in case of a fast double-fire.
        return prev.length >= PRODUCT_MAX_PHOTOS ? prev : [...prev, url];
      });
    } catch (e) {
      console.error('Failed to upload listing photo:', e);
      setImageUploadError(e.message || 'Failed to upload image');
    } finally {
      setImageUploading(false);
    }
  };

  const handleRemoveImage = (index) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== index));
  };

  // Super-Admin-managed list of product types (see ProductType model /
  // api.getProductTypes) that powers the Product Type dropdown below -
  // replaces what used to be a hardcoded PRODUCT_TYPES array.
  const [productTypes, setProductTypes] = useState([]);

  // OLX-style category filter chip - now applied server-side (see
  // fetchPromotions) so it stays correct across paginated pages instead of
  // only filtering whatever happened to be loaded already.
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Free-text query, either typed locally or dispatched from the global
  // header search panel (filter = "Product Type" / "Location" / "Anything").
  // Debounced into `debouncedQuery` below before it reaches the server, since
  // (unlike the old client-side filter) every change now triggers a network
  // request - without debouncing, fast typing would fire one request per
  // keystroke.
  const [textQuery, setTextQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [town, setTown, filterReady] = useLocationFilter(defaultTown, locationReady);
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(textQuery.trim()), 300);
    return () => clearTimeout(handle);
  }, [textQuery]);

  useEffect(() => {
    api.getProductTypes()
      .then((res) => {
        setProductTypes(res || []);
        setProductType((prev) => prev || res?.[0]?.name || '');
      })
      .catch((e) => console.error('Failed to load product types:', e));
  }, []);

  useEffect(() => {
    if (searchDispatch && ['productType', 'location', 'all'].includes(searchDispatch.type)) {
      const q = (searchDispatch.query || '').trim().toLowerCase();
      if (q === 'used machines' || q === 'used_machines') {
        setTextQuery('');
        setCategoryFilter('ALL');
      } else {
        setTextQuery(searchDispatch.query);
        if (searchDispatch.type === 'productType') {
          // If the query exactly matches a known category, jump straight to that chip.
          const match = productTypes.find(pt => pt.name.toLowerCase() === q);
          if (match) setCategoryFilter(match.name);
        }
      }
    }
  }, [searchDispatch?.nonce]);

  // Loads the first page for the current filters (category chip / search /
  // onlyOffers) - called on mount and whenever any of those filters change,
  // replacing whatever was loaded before rather than appending to it.
  const fetchPromotions = async () => {
    setLoading(true);
    try {
      const res = await api.getPromotions({
        // Offer Management (Super Admin) needs every offer regardless of
        // expiry for moderation; the plain marketplace feed only shows
        // active offers.
        includeExpiredOffers: onlyOffers,
        type: onlyOffers ? 'OFFER' : undefined,
        limit: PROMOTIONS_PAGE_SIZE,
        category: !onlyOffers && categoryFilter !== 'ALL' ? categoryFilter : undefined,
        search: debouncedQuery || undefined,
        town: town || undefined,
      });
      setPromotions(res.items);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Appends the next page, triggered by the sentinel div's IntersectionObserver
  // scrolling into view (see the effect below) - never replaces what's
  // already loaded.
  const fetchMorePromotions = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.getPromotions({
        includeExpiredOffers: onlyOffers,
        type: onlyOffers ? 'OFFER' : undefined,
        limit: PROMOTIONS_PAGE_SIZE,
        cursor: nextCursor,
        category: !onlyOffers && categoryFilter !== 'ALL' ? categoryFilter : undefined,
        search: debouncedQuery || undefined,
        town: town || undefined,
      });
      setPromotions((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  // Re-fetch page 1 whenever a filter changes (also covers the initial
  // mount-time load). Waits for `filterReady` (useLocationFilter's 3rd
  // return value), not the raw `locationReady` prop, first - see that
  // hook's comment for why the very first fetch must not fire with an
  // unresolved '' town.
  useEffect(() => {
    if (!filterReady) return;
    fetchPromotions();
  }, [categoryFilter, debouncedQuery, onlyOffers, town, filterReady]);

  // Infinite scroll: fetch the next page as soon as the sentinel div at the
  // bottom of the grid scrolls into view. Re-observing on every relevant
  // state change (rather than memoizing fetchMorePromotions) keeps this
  // simple and correct - the observer callback always closes over the
  // latest hasMore/nextCursor/filters.
  useEffect(() => {
    const node = loadMoreSentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchMorePromotions();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, nextCursor, loadingMore, categoryFilter, debouncedQuery, onlyOffers, town]);

  // The Offer create/edit form's "link to one of your own listings" dropdown
  // needs the caller's own full PRODUCT/AD listing set (not paginated - it's
  // inherently small, one shop's own inventory), fetched separately and only
  // while actually needed rather than as part of the main paginated feed.
  const [linkableListings, setLinkableListings] = useState([]);
  useEffect(() => {
    if (!showAddModal || type !== 'OFFER') {
      setLinkableListings([]);
      return;
    }
    api.getPromotions({ mine: true, excludeOffers: true })
      .then((res) => setLinkableListings(Array.isArray(res) ? res : []))
      .catch((e) => console.error('Failed to load linkable listings:', e));
  }, [showAddModal, type]);

  const resetForm = () => {
    setEditingId(null);
    setType('PRODUCT');
    setTitle('');
    setDescription('');
    setImageUrls([]);
    setImageUploadError('');
    setPrice('');
    setProductType(productTypes[0]?.name || '');
    setPhone('');
    setDiscountPercentage('');
    // New listings default to type PRODUCT (see the comment on the `type`
    // field below), so this must default to the max allowed expiry rather
    // than blank - blank would fail the now-`required` date input.
    setValidUntil((() => { const d = new Date(); d.setDate(d.getDate() + PRODUCT_MAX_VALIDITY_DAYS); return d.toISOString().slice(0, 10); })());
    setLinkedPromotionId('');
    setErrorMsg('');
  };

  const canManage = (promo) => isSuperAdmin ? promo.createdById === user.id : promo.shopId === user.shopId;

  const handleEditClick = (promo) => {
    setEditingId(promo.id);
    setType(promo.type);
    setTitle(promo.title);
    setDescription(promo.description || '');
    setImageUrls(promo.imageUrls && promo.imageUrls.length ? promo.imageUrls : (promo.imageUrl ? [promo.imageUrl] : []));
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
        // Always sent as a real array (even []) rather than undefined-when-
        // empty, so removing every photo on an edit actually clears them
        // server-side instead of being read as "leave unchanged".
        imageUrls,
        price: price === '' ? undefined : Number(price),
        productType: productType || undefined,
        phone: phone || undefined,
        discountPercentage: discountPercentage !== '' ? Number(discountPercentage) : undefined,
        validUntil: (type === 'OFFER' || type === 'PRODUCT') && validUntil ? new Date(validUntil).toISOString() : undefined,
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
      setErrorMsg(err.message || (editingId ? t('failedUpdateListing') : t('failedPublishListing')));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm(t('confirmRemoveListing'))) return;
    try {
      await api.deletePromotion(id);
      fetchPromotions();
    } catch (e) {
      alert(e.message);
    }
  };

  const typeMeta = (listingType) => listingType === 'AD'
    ? { label: t('advertisementLabel'), icon: Megaphone, color: 'purple' }
    : listingType === 'OFFER'
      ? { label: t('offerLabel'), icon: BadgePercent, color: 'rose' }
      : { label: t('promotionalProductLabel'), icon: Package, color: 'teal' };

  const isExpiredOffer = (promo) => promo.type === 'OFFER' && promo.validUntil && new Date(promo.validUntil) < new Date();

  // linkableListings (the Offer form's "link to one of your own listings"
  // dropdown, filtered to the caller's own shop server-side) is fetched
  // separately above - see the effect keyed on [showAddModal, type].
  const linkableListingsFiltered = linkableListings.filter(p => p.id !== editingId);

  // OLX-style category chips: sourced from the Super-Admin-curated product
  // type list (already fetched above), not from whatever page of the feed
  // happens to be loaded - otherwise a category with no listings on page 1
  // would be missing until the user scrolled far enough to see one.
  const availableCategories = !onlyOffers ? productTypes.map(pt => pt.name) : [];

  // `promotions` is already exactly the current filtered/paginated set from
  // the server (category + search + onlyOffers all applied there now - see
  // fetchPromotions) - no further client-side filtering needed.
  const visiblePromotions = promotions;

  if (detailStack.length > 0) {
    return (
      <ProductDetailsView
        promo={detailStack[detailStack.length - 1]}
        t={t}
        api={api}
        onBack={popDetail}
        onOpenRelated={pushDetail}
      />
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center" style={{ marginTop: 4, marginBottom: 18, gap: 10, flexWrap: 'wrap' }}>
        {/* Search + location split an equal 50/50 (same pattern as
            CategoryShopsView) - `minWidth: 0` on both overrides their
            default sizing so the flex split actually governs, instead of
            the search box's own min-width or the select's intrinsic width
            dominating the row. */}
        <div className="input-wrap" style={{ flex: '1 1 0', minWidth: 0, margin: 0 }}>
          <Search />
          <input
            type="text" value={textQuery} onChange={(e) => setTextQuery(e.target.value)}
            placeholder={t('searchInventoryPlaceholder')}
          />
        </div>
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <CustomSelect
            className="location-filter-select"
            icon={MapPin}
            value={town}
            onChange={setTown}
            placeholder="All Locations"
            searchable
            searchPlaceholder="Search district or town…"
            options={[{ value: '', label: 'All Locations' }, ...ALL_TN_LOCATIONS.map((loc) => ({ value: loc, label: loc }))]}
          />
        </div>
      </div>

      {availableCategories.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`badge ${categoryFilter === 'ALL' ? 'badge-gold' : ''}`}
            style={categoryFilter === 'ALL' ? undefined : { background: 'var(--card-2)', border: '1px solid var(--border-2)', color: 'var(--text-2)', cursor: 'pointer' }}
          >
            {t('allCategoriesLabel')}
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
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingListingsMsg')}</span>
        </div>
      ) : visiblePromotions.length === 0 ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 220 }}>
          <div className="icon-badge teal"><Package /></div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{onlyOffers ? t('noOffersPublishedYet') : t('noInventoryListedYet')}</span>
        </div>
      ) : (
        <div className="product-grid stagger-in">
          {visiblePromotions.map(promo => {
            const meta = typeMeta(promo.type);
            const Icon = meta.icon;
            const expired = isExpiredOffer(promo);
            return (
              promo.type === 'PRODUCT' ? (
              // Machines/Products - same visual language as the pre-login
              // Machines tab's card (.pub-card / .pub-card-media / .pub-card-title
              // / .pub-card-meta, shared global classes, not duplicated CSS) so
              // the two surfaces read as one consistent design. Unlike the
              // pre-login card this one isn't a fixed-height grid tile (it needs
              // room for the Call button, date and Edit/Remove), so the body's
              // normally-fixed height/overflow/truncation are overridden inline
              // to grow with content instead of clipping it.
              <div key={promo.id} className="pub-card" style={{ cursor: 'pointer' }} onClick={() => pushDetail(promo)}>
                <div className="pub-card-media">
                  {promo.imageUrl ? (
                    <img src={cleanGoogleImageUrl(promo.imageUrl)} alt={promo.title} loading="lazy" />
                  ) : (
                    <div className={`icon-badge ${meta.color}`}><Icon /></div>
                  )}
                  {expired && (
                    <span className="badge badge-suspended" style={{ position: 'absolute', top: 10, right: 10 }}>{t('expiredLabel')}</span>
                  )}
                </div>
                <div className="pub-card-body" style={{ height: 'auto', overflow: 'visible' }}>
                  <div className="pub-card-title" style={{ whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip' }}>{promo.title}</div>
                  {promo.productType && (
                    <div className="pub-card-meta"><Tag className="h-3 w-3" /><span>{promo.productType}</span></div>
                  )}
                  <div className="pub-card-meta"><Store className="h-3 w-3" /><span>{promo.shop?.name || t('superAdminIndependentLabel')}</span></div>
                  <PriceTag price={promo.price} discountPercentage={promo.discountPercentage} offSuffix={t('percentOffSuffix')} />
                </div>
                <div style={{ padding: '0 11px 11px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {promo.phone && (
                    // Plain tel: link - opens the system dialer automatically inside
                    // the native Android app (Capacitor's default WebViewClient
                    // launches an external ACTION_VIEW intent for non-http schemes),
                    // and falls back to the browser's normal tel: handling on web.
                    // stopPropagation so tapping Call doesn't also open details.
                    <a href={`tel:${promo.phone}`} className="btn btn-primary btn-sm btn-block" onClick={(e) => e.stopPropagation()}>
                      <Phone className="h-3.5 w-3.5" />
                      <span>{t('callPrefix')} {promo.phone}</span>
                    </a>
                  )}

                  <div className="cell-sub" style={{ fontSize: 11.5 }}>
                    <Calendar className="h-3 w-3" style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} />
                    {new Date(promo.createdAt).toLocaleDateString()}
                  </div>

                  {canManage(promo) && (
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditClick(promo); }}
                        className="btn btn-ghost btn-sm btn-block"
                        style={{ whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.2 }}
                      >
                        <Edit className="h-3.5 w-3.5" style={{ flexShrink: 0 }} />
                        <span>{t('editBtn')}</span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(promo.id); }}
                        className="btn btn-danger-outline btn-sm btn-block"
                        style={{ whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.2 }}
                      >
                        <Trash className="h-3.5 w-3.5" style={{ flexShrink: 0 }} />
                        <span>{t('removeBtn')}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              ) : (
              <div key={promo.id} className="product-card">
                <div className="product-img" style={{ height: 150, aspectRatio: '1 / 1', maxHeight: 190 }}>
                  {promo.imageUrl ? (
                    <img src={cleanGoogleImageUrl(promo.imageUrl)} alt={promo.title} loading="lazy" className="w-full h-full object-cover" style={{ opacity: 0.9 }} />
                  ) : (
                    <div className={`icon-badge ${meta.color}`}><Icon /></div>
                  )}
                  <span className="product-tag">
                    <Icon className="h-3 w-3" style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />{meta.label}
                  </span>
                  {expired && (
                    <span className="badge badge-suspended" style={{ position: 'absolute', top: 10, right: 10 }}>{t('expiredLabel')}</span>
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

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {promo.discountPercentage != null && (
                      <span className="badge badge-active">
                        <Percent className="h-3 w-3" style={{ display: 'inline', verticalAlign: '-1px' }} />
                        {promo.discountPercentage}{t('percentOffSuffix')}
                      </span>
                    )}
                    {promo.validUntil && (
                      <span className="badge" style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                        <Clock className="h-3 w-3" style={{ display: 'inline', verticalAlign: '-1px' }} />
                        {t('validTillPrefix')} {new Date(promo.validUntil).toLocaleDateString()}
                      </span>
                    )}
                    {promo.linkedPromotion && (
                      <span className="badge" style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                        {t('linkedPrefix')} {promo.linkedPromotion.title}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11, color: 'var(--text-2)', background: 'var(--card-2)', border: '1px solid var(--border)', padding: 10, borderRadius: 12, fontWeight: 600 }}>
                    <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={promo.shop?.name || t('superAdminIndependentLabel')}>
                      <span style={{ color: 'var(--text-3)', display: 'block', fontWeight: 800, textTransform: 'uppercase', fontSize: 9.5, letterSpacing: '.04em' }}>{t('shopLabel')}</span>
                      {promo.shop?.name || t('superAdminIndependentLabel')}
                    </div>
                    <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={promo.createdBy?.name || ''}>
                      <span style={{ color: 'var(--text-3)', display: 'block', fontWeight: 800, textTransform: 'uppercase', fontSize: 9.5, letterSpacing: '.04em' }}>{t('ownerLabel')}</span>
                      {promo.createdBy?.name || '—'}
                    </div>
                  </div>

                  {promo.phone && (
                    <a href={`tel:${promo.phone}`} className="btn btn-primary btn-sm btn-block">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{t('callPrefix')} {promo.phone}</span>
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
                        style={{ whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.2 }}
                      >
                        <Edit className="h-3.5 w-3.5" style={{ flexShrink: 0 }} />
                        <span>{t('editBtn')}</span>
                      </button>
                      <button
                        onClick={() => handleDelete(promo.id)}
                        className="btn btn-danger-outline btn-sm btn-block"
                        style={{ whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.2 }}
                      >
                        <Trash className="h-3.5 w-3.5" style={{ flexShrink: 0 }} />
                        <span>{t('removeBtn')}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              )
            );
          })}
        </div>
      )}

      {/* Infinite scroll: the sentinel div triggers fetchMorePromotions as
          soon as it scrolls into view (see the IntersectionObserver effect
          above). The "Load More" button underneath is a manual fallback for
          the rare case scrolling proximity doesn't fire it (very short
          viewports, WebView IntersectionObserver quirks) - both call the
          same fetchMorePromotions, so there's no risk of double-fetching
          beyond what the loadingMore guard already prevents. */}
      {!loading && hasMore && (
        <div ref={loadMoreSentinelRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 20 }}>
          {loadingMore ? (
            <RefreshCw className="animate-spin" style={{ width: 20, height: 20, color: 'var(--gold)' }} />
          ) : (
            <button type="button" onClick={fetchMorePromotions} className="btn btn-outline btn-sm">
              {t('loadMoreBtn')}
            </button>
          )}
        </div>
      )}

      {/* Add/Edit Listing Modal */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.85)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 640, margin: 'auto', padding: 28 }}>
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><Package /> {t('inventoryListingLabel')}</span>
                <h2 style={{ fontSize: 19 }}>{editingId ? t('editListingTitle') : t('newInventoryListingTitle')}</h2>
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
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Tag /></div><b>{t('nameLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                      placeholder={t('listingNamePlaceholderEg')}
                    />
                  </div>
                </div>

                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><Layers /></div><b>{t('productTypeLabel')}</b></div>
                  <CustomSelect
                    value={productType} onChange={setProductType}
                    placeholder={t('selectProductTypePlaceholder')}
                    emptyLabel={t('noProductTypesAvailable')}
                    options={productTypes.map(pt => ({ value: pt.name, label: pt.name }))}
                  />
                </div>

                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><FileText /></div><b>{t('descriptionOptionalLabel')}</b></div>
                  <div className="input-wrap">
                    <input
                      type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                      placeholder={t('shortDescriptionPlaceholder')}
                    />
                  </div>
                </div>
              </div>

              <div className="reg-section">

                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><ImageIcon /></div><b>{type === 'PRODUCT' ? t('productPhotoOptionalLabel') : t('imageMediaOptionalLabel')}</b></div>
                  <span className="cell-sub" style={{ display: 'block', marginBottom: 8 }}>
                    {t('photosUploadedCountLabel').replace('{count}', imageUrls.length).replace('{max}', PRODUCT_MAX_PHOTOS)}
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {imageUrls.map((url, idx) => (
                      <div key={idx} style={{ position: 'relative', width: 84, height: 84, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--card-2)', flexShrink: 0 }}>
                        <img src={cleanGoogleImageUrl(url)} alt={`Photo ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button
                          type="button" onClick={() => handleRemoveImage(idx)} title={t('removePhotoLabel')}
                          style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 999, background: 'rgba(0,0,0,.65)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <label
                          title={t('replacePhotoLabel')}
                          style={{ position: 'absolute', bottom: 3, right: 3, width: 20, height: 20, borderRadius: 999, background: 'rgba(0,0,0,.65)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: imageUploading ? 'default' : 'pointer' }}
                        >
                          <Edit className="h-3 w-3" />
                          <input
                            type="file" accept="image/*" className="hidden" disabled={imageUploading}
                            onClick={primeStoragePermission}
                            onChange={(e) => {
                              const file = e.target.files[0];
                              e.target.value = '';
                              handleImageFileSelect(file, idx);
                            }}
                          />
                        </label>
                      </div>
                    ))}
                    {imageUrls.length < PRODUCT_MAX_PHOTOS && (
                      <label
                        style={{ width: 84, height: 84, borderRadius: 12, border: '1.5px dashed var(--border-2)', background: 'var(--card-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: imageUploading ? 'default' : 'pointer', flexShrink: 0, opacity: imageUploading ? 0.6 : 1 }}
                      >
                        {imageUploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" style={{ color: 'var(--text-3)' }} />}
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)' }}>{imageUploading ? t('uploadingLabel') : t('uploadBtn')}</span>
                        <input
                          type="file" accept="image/*" className="hidden" disabled={imageUploading}
                          onClick={primeStoragePermission}
                          onChange={(e) => {
                            const file = e.target.files[0];
                            e.target.value = '';
                            handleImageFileSelect(file);
                          }}
                        />
                      </label>
                    )}
                  </div>
                  {imageUploadError && (
                    <p style={{ marginTop: 6, fontSize: 11, color: 'var(--rose)', fontWeight: 700 }}>{imageUploadError}</p>
                  )}
                </div>

                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><IndianRupee /></div><b>{t('priceOptionalLabel')}</b></div>
                  <div className="input-wrap">
                    <input
                      type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)}
                      placeholder={t('priceLeaveBlankPlaceholder')}
                    />
                  </div>
                </div>

                {type === 'PRODUCT' && (
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><Percent /></div><b>{t('offerPercentOptionalLabel')}</b></div>
                    <div className="input-wrap">
                      <input
                        type="number" min="0" max="100" step="1" value={discountPercentage}
                        onChange={(e) => setDiscountPercentage(e.target.value)}
                        placeholder={t('offerPercentPlaceholderEg')}
                      />
                    </div>
                    {price !== '' && discountPercentage !== '' && Number(discountPercentage) > 0 && (
                      <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>
                        {t('offerPriceLabel')}: ₹{Math.round(Number(price) - (Number(price) * Number(discountPercentage)) / 100).toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>
                )}

                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Phone /></div><b>{t('phoneNumberLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)}
                      placeholder={t('phoneNumberPlaceholderEg')}
                    />
                  </div>
                  <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>{t('tapToCallHint')}</span>
                </div>

                {type === 'PRODUCT' && (
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><CalendarRange /></div><b>{t('machineExpiryLabel')}</b></div>
                    <div className="input-wrap">
                      <input
                        type="date" required value={validUntil}
                        min={new Date().toISOString().slice(0, 10)}
                        max={(() => { const d = new Date(); d.setDate(d.getDate() + PRODUCT_MAX_VALIDITY_DAYS); return d.toISOString().slice(0, 10); })()}
                        onChange={(e) => setValidUntil(e.target.value)}
                      />
                    </div>
                    <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>{t('machineExpiryHint')}</span>
                  </div>
                )}
              </div>

              {type === 'OFFER' && (
                <div className="reg-section">

                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><Percent /></div><b>{t('discountPercentageOptionalLabel')}</b></div>
                    <div className="input-wrap">
                      <input
                        type="number" min="0" max="100" step="1" value={discountPercentage}
                        onChange={(e) => setDiscountPercentage(e.target.value)}
                        placeholder={t('discountPercentagePlaceholderEg')}
                      />
                    </div>
                  </div>

                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><CalendarRange /></div><b>{t('validUntilOptionalLabel')}</b></div>
                    <div className="input-wrap">
                      <input
                        type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)}
                      />
                    </div>
                    <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>{t('validUntilHint')}</span>
                  </div>

                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><Boxes /></div><b>{t('linkExistingListingLabel')}</b></div>
                    <CustomSelect
                      value={linkedPromotionId} onChange={setLinkedPromotionId}
                      options={[
                        { value: '', label: t('noLinkedListingOption') },
                        ...linkableListingsFiltered.map(p => ({ value: p.id, label: `${p.title} (${p.type === 'AD' ? t('advertisementLabel') : t('productLabel')})` })),
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
                  {t('btnCancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={imageUploading}
                >
                  {editingId ? t('saveChangesBtn') : t('publishListingBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Portaled to escape .animate-fade-in's permanent transform (fill-mode
          forwards) - see ShopsManagementView's identical FAB for why. Without
          this, the button ends up "fixed" relative to that ancestor's box
          instead of the viewport, so it drifts down and overlaps the bottom
          nav as the product grid grows taller. */}
      {createPortal(
        <button
          type="button"
          onClick={() => { resetForm(); setShowAddModal(true); }}
          className="fab"
          aria-label={t('newListingBtn')}
          title={t('newListingBtn')}
        >
          <Plus />
        </button>,
        document.body
      )}
    </div>
  );
}

// Dedicated Product Details page for Shop Admin + Super Admin (both share
// PromotionsFeed above via its `isSuperAdmin` prop, so this one component
// covers both surfaces). Read-only - edit/delete stay on the card in the
// list, not duplicated here. Pushed onto PromotionsFeed's `detailStack`;
// tapping a Related Product pushes another level rather than replacing this
// one, so Back steps back through everything visited (see pushDetail/popDetail).
function ProductDetailsView({ promo, t, api, onBack, onOpenRelated }) {
  const [related, setRelated] = useState([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!promo.productType) { setRelated([]); return; }
    setLoadingRelated(true);
    api.getPromotions({ category: promo.productType, type: 'PRODUCT', limit: 7 })
      .then((res) => {
        if (cancelled) return;
        const items = (res.items || res || []).filter((p) => p.id !== promo.id).slice(0, 6);
        setRelated(items);
      })
      .catch(() => { if (!cancelled) setRelated([]); })
      .finally(() => { if (!cancelled) setLoadingRelated(false); });
    return () => { cancelled = true; };
  }, [promo.id, promo.productType]);

  // Address/phone aren't real Shop columns - parsed from the same
  // companyDetails JSON blob every other screen already reads (see
  // ShopSettingsView) - CREATOR_INCLUDE now selects it for exactly this.
  let shopAddress = null;
  let shopPhone = null;
  if (promo.shop?.companyDetails) {
    try {
      const details = JSON.parse(promo.shop.companyDetails);
      shopAddress = details.address || null;
      shopPhone = details.phone || null;
    } catch { /* not valid JSON - just omit */ }
  }
  const shopLocation = [promo.shop?.town, promo.shop?.district].filter(Boolean).join(', ');
  const images = [...(promo.imageUrls || []), ...(promo.imageUrls?.length ? [] : [promo.imageUrl])]
    .filter(Boolean)
    .map(cleanGoogleImageUrl);

  return (
    <div className="animate-fade-in">
      <button type="button" onClick={onBack} className="btn btn-ghost btn-sm" style={{ marginBottom: 14 }}>
        <ArrowLeft className="h-4 w-4" />
        <span>{t('btnBack')}</span>
      </button>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <ImageCarousel images={images} t={t} />

        <div style={{ padding: 18 }}>
          <h1 style={{ fontSize: 19, marginBottom: 6 }}>{promo.title}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {promo.productType && (
              <span className="badge" style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                <Tag className="h-3 w-3" style={{ display: 'inline', verticalAlign: '-1px' }} /> {promo.productType}
              </span>
            )}
            {promo.discountPercentage != null && (
              <span className="badge badge-active">
                <Percent className="h-3 w-3" style={{ display: 'inline', verticalAlign: '-1px' }} />
                {promo.discountPercentage}{t('percentOffSuffix')}
              </span>
            )}
          </div>

          <PriceTag price={promo.price} discountPercentage={promo.discountPercentage} offSuffix={t('percentOffSuffix')} />

          {promo.description && (
            <p style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 12, lineHeight: 1.5, wordBreak: 'break-word' }}>{promo.description}</p>
          )}

          <div className="cell-sub" style={{ fontSize: 11.5, marginTop: 12 }}>
            <Calendar className="h-3 w-3" style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} />
            {new Date(promo.createdAt).toLocaleDateString()}
          </div>

          {/* Shop details block */}
          <div style={{ marginTop: 18, background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
              {t('shopLabel')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13.5, marginBottom: shopLocation || shopAddress || shopPhone ? 6 : 0 }}>
              <Store className="h-3.5 w-3.5" style={{ flexShrink: 0, color: 'var(--text-3)' }} />
              <span>{promo.shop?.name || t('superAdminIndependentLabel')}</span>
            </div>
            {shopLocation && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-2)', marginBottom: 4 }}>
                <MapPin className="h-3.5 w-3.5" style={{ flexShrink: 0, color: 'var(--text-3)' }} />
                <span>{shopAddress ? `${shopAddress} · ${shopLocation}` : shopLocation}</span>
              </div>
            )}
            {shopPhone && (
              <a href={`tel:${shopPhone}`} className="btn btn-primary btn-sm btn-block" style={{ marginTop: 10 }}>
                <Phone className="h-3.5 w-3.5" />
                <span>{t('callPrefix')} {shopPhone}</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Related Products */}
      {(loadingRelated || related.length > 0) && (
        <div style={{ marginTop: 22 }}>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>{t('relatedProductsTitle', 'Related Products')}</h2>
          {loadingRelated ? (
            <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100 }}>
              <RefreshCw className="animate-spin" style={{ width: 22, height: 22, color: 'var(--gold)' }} />
            </div>
          ) : (
            <div className="product-grid stagger-in">
              {related.map((rp) => (
                <div key={rp.id} className="pub-card" style={{ cursor: 'pointer' }} onClick={() => onOpenRelated(rp)}>
                  <div className="pub-card-media">
                    {rp.imageUrl ? (
                      <img src={cleanGoogleImageUrl(rp.imageUrl)} alt={rp.title} loading="lazy" />
                    ) : (
                      <div className="icon-badge teal"><Package /></div>
                    )}
                  </div>
                  <div className="pub-card-body">
                    <div className="pub-card-title">{rp.title}</div>
                    <div className="pub-card-meta"><Store className="h-3 w-3" /><span>{rp.shop?.name || t('superAdminIndependentLabel')}</span></div>
                    <PriceTag price={rp.price} discountPercentage={rp.discountPercentage} offSuffix={t('percentOffSuffix')} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SHOP ADMIN: OFFERS, ADS & BANNERS - read-only browse screen for every active
// advertisement (popup/banner/notice) and every independent (shopId === null)
// offer the Super Admin has published. Ads are already active+targeted-filtered
// server-side (AdService.getTargetedAds); offers are filtered here client-side.
// ============================================================================
function OffersAdsBannersView({ t, api }) {
  const [ads, setAds] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  // Ads have no other detail to navigate to (no CTA/link/description field on
  // Advertisement) - tapping a card just shows its image at full size, same
  // pattern as the public pre-login app's PublicAdViewer.
  const [viewingAd, setViewingAd] = useState(null);

  // Locks background scroll while the full-screen poster is open - it's a
  // `position: fixed` overlay so the page behind it can't visually move,
  // but without this the body itself could still scroll underneath it on
  // touch devices.
  useEffect(() => {
    if (!viewingAd) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, [viewingAd]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [adsRes, promosRes] = await Promise.all([api.getAdvertisements(), api.getPromotions()]);
        setAds(adsRes || []);
        const now = new Date();
        setOffers(
          (promosRes || []).filter(
            (p) => p.type === 'OFFER' && !p.shopId && (!p.validUntil || new Date(p.validUntil) >= now)
          )
        );
      } catch (e) {
        console.error('Failed to load offers/ads/banners', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const typeLabel = { POPUP: t('interactivePopupLabel'), BANNER: t('mainBannerLabel'), NOTICE: t('textNoticeLabel') };
  const accents = ['var(--gold)', 'var(--teal)', 'var(--rose)', 'var(--purple)', 'var(--skyblue)', 'var(--jgreen)'];

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Sparkles /> {t('fromKeyShopHqLabel')}</div>
          <h1>{t('offersAdsBannersTitle')}</h1>
          <p>{t('everyActiveAdOfferDesc')}</p>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
          <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingEllipsis')}</span>
        </div>
      ) : ads.length === 0 && offers.length === 0 ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 220 }}>
          <div className="icon-badge teal"><Megaphone /></div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{t('nothingPublishedYet')}</span>
        </div>
      ) : (
        <>
          {ads.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, margin: '4px 0 12px' }}>{t('advertisementsAndBannersLabel')}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16, marginBottom: 26 }}>
                {ads.map((ad, i) => (
                  <div
                    key={ad.id}
                    onClick={() => setViewingAd(ad)}
                    style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${accents[i % accents.length]}`, background: 'var(--card-2)', cursor: 'pointer' }}
                  >
                    <img src={cleanGoogleImageUrl(ad.imageUrl)} alt={ad.title} style={{ width: '100%', height: 150, objectFit: 'cover' }} />
                    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span className="badge" style={{ alignSelf: 'flex-start', background: accents[i % accents.length], color: 'var(--bg-0, #0a0908)', fontSize: 10 }}>
                        {typeLabel[ad.type] || ad.type}
                      </span>
                      <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 13.5, color: 'var(--text-0)' }}>{ad.title}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {offers.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, margin: '4px 0 12px' }}>{t('offersLabel')}</h3>
              <div className="product-grid stagger-in">
                {offers.map((promo) => (
                  <div key={promo.id} className="product-card">
                    <div className="product-img" style={{ height: 150, aspectRatio: '1 / 1', maxHeight: 190 }}>
                      {promo.imageUrl ? (
                        <img src={cleanGoogleImageUrl(promo.imageUrl)} alt={promo.title} className="w-full h-full object-cover" style={{ opacity: 0.9 }} />
                      ) : (
                        <div className="icon-badge rose"><BadgePercent /></div>
                      )}
                    </div>
                    <div className="product-body">
                      <span className="pname">{promo.title}</span>
                      {promo.description && <p className="cell-sub" style={{ fontSize: 11.5 }}>{promo.description}</p>}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {promo.discountPercentage != null && (
                          <span className="badge badge-active">
                            <Percent className="h-3 w-3" style={{ display: 'inline', verticalAlign: '-1px' }} />
                            {promo.discountPercentage}{t('percentOffSuffix')}
                          </span>
                        )}
                        {promo.validUntil && (
                          <span className="badge" style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                            <Clock className="h-3 w-3" style={{ display: 'inline', verticalAlign: '-1px' }} />
                            {t('validTillPrefix')} {new Date(promo.validUntil).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {promo.phone && (
                        <a href={`tel:${promo.phone}`} className="btn btn-primary btn-sm btn-block">
                          <Phone className="h-3.5 w-3.5" />
                          <span>{t('callPrefix')}: {promo.phone}</span>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {viewingAd && createPortal(
        // Portaled to document.body - rendering this inline (as it was
        // before) put it under app-main's own stacking/scroll context, so
        // `position: fixed` was computing relative to that scrolled
        // ancestor instead of the true viewport: tapping a poster near the
        // bottom of a long list opened it below the visible screen,
        // requiring a scroll to find it. Every other full-screen modal in
        // this file already portals to document.body for exactly this
        // reason - this one had been missed.
        <div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
          style={{ overflow: 'hidden' }}
          onClick={() => setViewingAd(null)}
        >
          <button
            type="button"
            onClick={() => setViewingAd(null)}
            className="icon-btn"
            style={{ position: 'absolute', top: 18, right: 18, background: 'rgba(255,255,255,0.12)', color: '#fff' }}
            aria-label={t('btnClose')}
          >
            <X className="h-4 w-4" />
          </button>
          <img
            src={cleanGoogleImageUrl(viewingAd.imageUrl)}
            alt={viewingAd.title}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 12 }}
          />
          {viewingAd.title && (
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, marginTop: 14, textAlign: 'center' }}>{viewingAd.title}</span>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ============================================================================
// DEALERS DIRECTORY VIEW (SHOP ADMIN & SUPER ADMIN)
// Displays public shop/dealer listings in a vertical stack with shop logo,
// category badge, address, website link, and WhatsApp/Call quick action buttons.
// Includes interactive Category Filter Cards at the top (All Shops, Key Shops,
// ECM, Meter, Scanner).
// ============================================================================
// ============================================================================
// DEDICATED CATEGORY SHOPS VIEW
// Displays shops belonging specifically to Key Shops, ECM, Meter, or Scanning.
// Each screen has its own Title, Search, Filter, and Responsive Layout.
// ============================================================================
// In-memory cache per category (module scope, public data so no user-scoping
// needed) - this view unmounts/remounts on every tab switch (Key Shops/ECM/
// Meter/Scanning each mount a fresh instance), so without this every bare
// revisit blanked to a spinner before showing anything, same root cause as
// the DashboardView fix. Shape mirrors dealersFirstPageCache below (an
// `{items, nextCursor, hasMore}` page, not a flat array) now that this view
// paginates too.
const categoryShopsCache = {};
// Page size for this view's cursor pagination - see DEALERS_PAGE_SIZE below
// (same value, same rationale) and ShopService.searchPublicShops. This view
// previously fetched every shop in a category with no `limit` at all - the
// backend's unpaginated branch silently caps at 50, so any category (Key
// Shops/ECM/Meter/Scanning) with more than 50 active shops had entries that
// were simply unreachable, with no error and no "Load More" affordance.
const CATEGORY_SHOPS_PAGE_SIZE = 20;

function CategoryShopsView({ categoryKey, icon: IconComponent, t, api, defaultTown, locationReady }) {
  const cachedPage = categoryShopsCache[categoryKey] || null;
  const [dealers, setDealers] = useState(cachedPage ? cachedPage.items : []);
  const [loading, setLoading] = useState(!cachedPage);
  // Infinite-scroll pagination state - `dealers` only ever holds the pages
  // loaded so far, never every shop in the category (see fetchDealers/
  // fetchMoreDealers below) - mirrors DealersView's identical state.
  const [nextCursor, setNextCursor] = useState(cachedPage ? cachedPage.nextCursor : null);
  const [hasMore, setHasMore] = useState(cachedPage ? cachedPage.hasMore : false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef(null);
  const [query, setQuery] = useState('');
  const [town, setTown, filterReady] = useLocationFilter(defaultTown, locationReady);
  // Debounced before it reaches the server - see DealersView/PromotionsFeed's
  // identical pattern for why (every change now triggers a network request).
  // A separate debounced value (not just a debounced fetch call) matters
  // here specifically because fetchMoreDealers below needs a stable filter
  // to page through - if it read the raw, still-being-typed `query` instead,
  // a "Load More" that fires while the user is mid-keystroke would page
  // through a different filter than the one the visible list was loaded
  // with.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(handle);
  }, [query]);

  const fetchDealers = async () => {
    // "Default view" means town is either empty or whatever GPS resolved as
    // the default (not just empty) - locationReady gating (see App()'s
    // locationReady) means the very first fetch may already carry a
    // GPS-resolved town, so comparing against '' only would mean this cache
    // never populates for any user with a resolved location.
    const isDefaultView = !debouncedQuery && (!town || town === defaultTown);
    // Only blank to a spinner for a real search/filter or a genuinely empty
    // screen - a bare revisit renders the cached first page instantly and
    // refreshes silently in the background.
    if (!isDefaultView || dealers.length === 0) setLoading(true);
    try {
      const res = await api.searchPublicShops({ query: debouncedQuery, category: categoryKey, town, limit: CATEGORY_SHOPS_PAGE_SIZE });
      setDealers(res.items);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
      if (isDefaultView) {
        categoryShopsCache[categoryKey] = { items: res.items, nextCursor: res.nextCursor, hasMore: !!res.nextCursor };
      }
    } catch (e) {
      console.error('Failed to fetch category dealers', e);
    } finally {
      setLoading(false);
    }
  };

  // Appends the next page - triggered by the sentinel scrolling into view or
  // the manual "Load More" fallback button. Mirrors DealersView's identical
  // fetchMoreDealers.
  const fetchMoreDealers = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.searchPublicShops({ query: debouncedQuery, category: categoryKey, town, cursor: nextCursor, limit: CATEGORY_SHOPS_PAGE_SIZE });
      setDealers((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
    } catch (e) {
      console.error('Failed to fetch more category dealers', e);
    } finally {
      setLoadingMore(false);
    }
  };

  // Also waits for `filterReady` (useLocationFilter's 3rd return value),
  // not the raw `locationReady` prop, before the very first fetch - see
  // that hook's comment for the full "no flicker, no stale intermediate
  // fetch" rationale.
  useEffect(() => {
    if (!filterReady) return;
    fetchDealers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, town, categoryKey, filterReady]);

  useEffect(() => {
    const node = loadMoreSentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchMoreDealers();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, nextCursor, loadingMore, debouncedQuery, town]);

  let title = t('dealers');
  let description = t('dealersDesc');
  let accentColor = 'var(--gold)';

  if (categoryKey === 'KEY_SHOPS') {
    title = t('keyShops');
    description = t('keyShopsDesc');
    accentColor = 'var(--purple)';
  } else if (categoryKey === 'ECM') {
    title = t('ecm');
    description = t('ecmDesc');
    accentColor = 'var(--orange)';
  } else if (categoryKey === 'METER') {
    title = t('meter');
    description = t('meterDesc');
    accentColor = 'var(--skyblue)';
  } else if (categoryKey === 'SCANNER') {
    title = t('scanning');
    description = t('scanningDesc');
    accentColor = 'var(--teal)';
  }

  // `dealers` is already exactly-filtered to this category server-side (see
  // ShopService.searchPublicShops's `category` where-clause) - no client-side
  // re-filtering needed here anymore.

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ color: accentColor }}>
            {IconComponent ? <IconComponent className="h-4 w-4 inline-block mr-1" /> : <Store className="h-4 w-4 inline-block mr-1" />}
            {title} {t('directory') || 'Directory'}
          </div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>

      {/* Search Bar + location filter - category filter buttons completely
          removed per earlier user request (this view is already scoped to
          one category via categoryKey). Equal 50/50 split, always on one
          row (no wrap) at every viewport width - `minWidth: 0` on both
          overrides .search-box's own 220px min-width and the location
          select's default sizing so a true 50/50 flex split governs both,
          even on narrow phones. */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 10 }}>
        <div className="search-box" style={{ flex: '1 1 0', minWidth: 0 }}>
          <Search />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchDealersPlaceholder') || 'Search shops by name, address, phone...'}
          />
          {query && (
            <button onClick={() => setQuery('')} className="icon-btn" style={{ width: 26, height: 26 }}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <CustomSelect
            className="location-filter-select"
            icon={MapPin}
            value={town}
            onChange={setTown}
            placeholder="All Locations"
            searchable
            searchPlaceholder="Search district or town…"
            options={[{ value: '', label: 'All Locations' }, ...ALL_TN_LOCATIONS.map((loc) => ({ value: loc, label: loc }))]}
          />
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
          <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: accentColor }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingEllipsis')}</span>
        </div>
      ) : dealers.length === 0 ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 220 }}>
          <div className="icon-badge" style={{ background: accentColor, color: '#ffffff' }}>
            {IconComponent ? <IconComponent style={{ width: 24, height: 24 }} /> : <Store style={{ width: 24, height: 24 }} />}
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{t('noShopsFound')}</span>
        </div>
      ) : (
        <div className="dealer-list stagger-in">
          {dealers.map((dealer) => (
            <div key={dealer.id} className="dealer-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                <div className="dealer-logo" style={{ background: 'var(--card-2)', padding: 4 }}>
                  <img src={categoryImage(dealer.category)} alt={dealer.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
                <div className="dealer-info">
                  <div className="dealer-name">{dealer.name}</div>
                  {dealer.category && (
                    <div className="dealer-line">
                      <Tag /> <span>{dealer.category}</span>
                    </div>
                  )}
                  {dealer.address && (
                    <div className="dealer-line">
                      <MapPin /> <span>{dealer.address}</span>
                    </div>
                  )}
                  {dealer.website && (
                    <div className="dealer-line">
                      <Globe />
                      <a href={dealer.website.startsWith('http') ? dealer.website : `https://${dealer.website}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)', textDecoration: 'none' }}>
                        {dealer.website}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div className="dealer-quick-actions">
                {dealer.phone && (
                  <>
                    <a href={`tel:${dealer.phone}`} className="dealer-quick-btn call">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{t('callPrefix') || 'Call'}</span>
                    </a>
                    <a href={`https://wa.me/${dealer.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="dealer-quick-btn whatsapp">
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span>WhatsApp</span>
                    </a>
                  </>
                )}
                <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--text-3)' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Infinite scroll (sentinel) + manual "Load More" fallback - see
          DealersView/PromotionsFeed's identical pattern for why both exist. */}
      {!loading && hasMore && (
        <div ref={loadMoreSentinelRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 20 }}>
          {loadingMore ? (
            <RefreshCw className="animate-spin" style={{ width: 20, height: 20, color: accentColor }} />
          ) : (
            <button type="button" onClick={fetchMoreDealers} className="btn btn-outline btn-sm">
              {t('loadMoreBtn')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// DEALERS DIRECTORY VIEW (SHOP ADMIN & SUPER ADMIN)
// Displays registered public shop/dealer listings across India with non-scrollable
// category filter cards (All, Key Shops, ECM, Meter, Scanning).
// ============================================================================
// Page size for the Dealers directory's cursor pagination - see
// ShopService.searchPublicShops.
const DEALERS_PAGE_SIZE = 20;

// Caches only the first page of the default (no search, "ALL" category)
// list - module scope, same rationale as shopsFirstPageCache above.
let dealersFirstPageCache = null;

function DealersView({ t, api, defaultTown, locationReady }) {
  const [dealers, setDealers] = useState(dealersFirstPageCache ? dealersFirstPageCache.items : []);
  const [loading, setLoading] = useState(!dealersFirstPageCache);
  // Infinite-scroll pagination state - `dealers` only ever holds the pages
  // loaded so far, never the whole directory (see fetchDealers/fetchMoreDealers).
  const [nextCursor, setNextCursor] = useState(dealersFirstPageCache ? dealersFirstPageCache.nextCursor : null);
  const [hasMore, setHasMore] = useState(dealersFirstPageCache ? dealersFirstPageCache.hasMore : false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef(null);
  const [query, setQuery] = useState('');
  const [town, setTown, filterReady] = useLocationFilter(defaultTown, locationReady);
  // Debounced before it reaches the server - see PromotionsFeed's identical
  // pattern for why (every change now triggers a network request).
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(handle);
  }, [query]);

  // Loads the first page for the current search, replacing whatever was
  // loaded before. The category filter cards were removed - this always
  // browses every category now (see ShopService.searchPublicShops's
  // `category` param, simply omitted here).
  const fetchDealers = async () => {
    // "Default view" means town is either empty or whatever GPS resolved as
    // the default (not just empty) - see CategoryShopsView's identical
    // comment for why: locationReady gating means the very first fetch may
    // already carry a GPS-resolved town.
    const isDefaultView = !debouncedQuery && (!town || town === defaultTown);
    // Only blank to a spinner for a real search or a genuinely empty
    // screen - a bare revisit renders the cached first page instantly and
    // refreshes silently in the background.
    if (!isDefaultView || dealers.length === 0) setLoading(true);
    try {
      const res = await api.searchPublicShops({ query: debouncedQuery, town, limit: DEALERS_PAGE_SIZE });
      setDealers(res.items);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
      if (isDefaultView) {
        dealersFirstPageCache = { items: res.items, nextCursor: res.nextCursor, hasMore: !!res.nextCursor };
      }
    } catch (e) {
      console.error('Failed to fetch dealers', e);
    } finally {
      setLoading(false);
    }
  };

  // Appends the next page - triggered by the sentinel scrolling into view or
  // the manual "Load More" fallback button.
  const fetchMoreDealers = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.searchPublicShops({ query: debouncedQuery, town, cursor: nextCursor, limit: DEALERS_PAGE_SIZE });
      setDealers((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
    } catch (e) {
      console.error('Failed to fetch more dealers', e);
    } finally {
      setLoadingMore(false);
    }
  };

  // Waits for `filterReady` before the very first fetch - see
  // ShopsManagementView's identical guard for the full rationale.
  useEffect(() => {
    if (!filterReady) return;
    fetchDealers();
  }, [debouncedQuery, town, filterReady]);

  useEffect(() => {
    const node = loadMoreSentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchMoreDealers();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, nextCursor, loadingMore, debouncedQuery, town]);

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Store /> {t('dealersEyebrow')}</div>
          <h1>{t('dealersPageTitle')}</h1>
          <p>{t('dealersPageDesc')}</p>
        </div>
      </div>

      {/* Search Panel + location filter */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div className="search-box" style={{ flex: '2 1 260px' }}>
          <Search />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchDealersPlaceholder') || 'Search dealers by name, location, category...'}
          />
          {query && (
            <button onClick={() => setQuery('')} className="icon-btn" style={{ width: 26, height: 26 }}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <CustomSelect
          className="location-filter-select"
          icon={MapPin}
          value={town}
          onChange={setTown}
          placeholder="All Locations"
          searchable
          searchPlaceholder="Search district or town…"
          options={[{ value: '', label: 'All Locations' }, ...ALL_TN_LOCATIONS.map((loc) => ({ value: loc, label: loc }))]}
          triggerStyle={{ minWidth: 180 }}
        />
      </div>

      {loading ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
          <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingEllipsis')}</span>
        </div>
      ) : dealers.length === 0 ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 220 }}>
          <div className="icon-badge rose"><Store /></div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{t('noDealersFoundMsg') || 'No dealers found matching your search.'}</span>
        </div>
      ) : (
        <div className="dealer-list stagger-in">
          {dealers.map((dealer) => (
            <div key={dealer.id} className="dealer-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                <div className="dealer-logo">
                  <img src={categoryImage(dealer.category)} alt={dealer.name} />
                </div>
                <div className="dealer-info">
                  <div className="dealer-name">{dealer.name}</div>
                  {dealer.category && (
                    <div className="dealer-line">
                      <Tag /> <span>{dealer.category}</span>
                    </div>
                  )}
                  {dealer.address && (
                    <div className="dealer-line">
                      <MapPin /> <span>{dealer.address}</span>
                    </div>
                  )}
                  {dealer.website && (
                    <div className="dealer-line">
                      <Globe />
                      <a href={dealer.website.startsWith('http') ? dealer.website : `https://${dealer.website}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)', textDecoration: 'none' }}>
                        {dealer.website}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div className="dealer-quick-actions">
                {dealer.phone && (
                  <>
                    <a href={`tel:${dealer.phone}`} className="dealer-quick-btn call">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{t('callPrefix') || 'Call'}</span>
                    </a>
                    <a href={`https://wa.me/${dealer.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="dealer-quick-btn whatsapp">
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span>WhatsApp</span>
                    </a>
                  </>
                )}
                <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--text-3)' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Infinite scroll (sentinel) + manual "Load More" fallback - see
          PromotionsFeed's identical pattern for why both exist. */}
      {!loading && hasMore && (
        <div ref={loadMoreSentinelRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 20 }}>
          {loadingMore ? (
            <RefreshCw className="animate-spin" style={{ width: 20, height: 20, color: 'var(--gold)' }} />
          ) : (
            <button type="button" onClick={fetchMoreDealers} className="btn btn-outline btn-sm">
              {t('loadMoreBtn')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// COMPONENT 7: REVENUE MANAGEMENT (SUPER ADMIN ONLY)
// ============================================================================
// In-memory cache (module scope) - same rationale as dashboardCache above.
let revenueRecordsCache = null;

function RevenueManagementView({ t, api }) {
  const [records, setRecords] = useState(revenueRecordsCache || []);
  const [loading, setLoading] = useState(!revenueRecordsCache);

  // Form states
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchRevenue();
  }, []);

  const fetchRevenue = async () => {
    if (records.length === 0) setLoading(true);
    try {
      const res = await api.getRevenue();
      setRecords(res);
      revenueRecordsCache = res;
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
      alert(t('enterValidAmountMsg'));
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
          <div className="eyebrow"><IndianRupee /> {t('platformFinanceLabel')}</div>
          <h1>{t('monthlyRevenueLogsTitle')}</h1>
          <p>{t('recordSubscriptionCollectionsDesc')}</p>
        </div>
      </div>

      {!loading && records.length > 0 && (
        <div className="stat-grid three">
          <div className="stat-card" style={{ animationDelay: '.05s' }}>
            <div className="stat-top">
              <div className="icon-badge jgreen"><Banknote /></div>
              <span className="stat-trend"><TrendingUp />{t('allTimeLower')}</span>
            </div>
            <div className="stat-num"><CountUp value={totalCollected} decimals={2} prefix="₹" /></div>
            <div className="stat-label">{t('totalRevenueCollectedLabel')}</div>
          </div>
          <div className="stat-card" style={{ animationDelay: '.15s' }}>
            <div className="stat-top">
              <div className="icon-badge blue"><Calendar /></div>
              <span className="stat-trend"><TrendingUp />{thisYear}</span>
            </div>
            <div className="stat-num"><CountUp value={yearTotal} decimals={2} prefix="₹" /></div>
            <div className="stat-label">{t('collectedThisYearLabel')}</div>
          </div>
          <div className="stat-card" style={{ animationDelay: '.25s' }}>
            <div className="stat-top">
              <div className="icon-badge orange"><Receipt /></div>
            </div>
            <div className="stat-num"><CountUp value={records.length} /></div>
            <div className="stat-label">{t('revenueRecordsAvgLabel')} &#8377;{avgPerRecord.toFixed(2)}</div>
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="card chart-card">
          <div className="section-title">
            <h2>{t('collectionsTrendLabel')}</h2>
            <span className="sub">{t('lastLoggedEntriesPrefix')} {chartRecords.length || 0} {t('loggedEntriesSuffix')}</span>
          </div>

          {loading ? (
            <div style={{ display: 'flex', height: 190, alignItems: 'center', justifyContent: 'center' }}>
              <RefreshCw className="animate-spin" style={{ width: 24, height: 24, color: 'var(--gold)' }} />
            </div>
          ) : chartRecords.length === 0 ? (
            <div style={{ display: 'flex', height: 190, alignItems: 'center', justifyContent: 'center', fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>
              {t('noRevenueLogsYet')}
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
            <h2>{t('addRevenueRecordLabel')}</h2>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="reg-section">

              <div className="row2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="reg-field" style={{ marginBottom: 0 }}>
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Calendar /></div><b>{t('monthLabel')}</b></div>
                  <CustomSelect
                    value={month} onChange={(v) => setMonth(Number(v))}
                    options={Array.from({ length: 12 }, (_, i) => ({
                      value: i + 1,
                      label: new Date(2000, i).toLocaleString('default', { month: 'long' }),
                    }))}
                  />
                </div>
                <div className="reg-field" style={{ marginBottom: 0 }}>
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><CalendarRange /></div><b>{t('yearLabel')}</b></div>
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
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><IndianRupee /></div><b>{t('amountCollectedRupeeLabel')} <span className="req">*</span></b></div>
                <div className="input-wrap">
                  <input
                    type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)}
                    placeholder="2450.00"
                  />
                </div>
              </div>

              <div className="reg-field">
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><FileText /></div><b>{t('notesRemarksLabel')}</b></div>
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
              <span>{t('logRevenuePayoutBtn')}</span>
            </button>
          </form>
        </div>
      </div>

      <div className="card table-card" style={{ marginTop: 22 }}>
        <div className="table-head">
          <h2 style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 17 }}>{t('platformRevenueHistoryLabel')}</h2>
        </div>

        {loading ? (
          <div style={{ display: 'flex', height: 140, alignItems: 'center', justifyContent: 'center' }}>
            <RefreshCw className="animate-spin" style={{ width: 24, height: 24, color: 'var(--gold)' }} />
          </div>
        ) : records.length === 0 ? (
          <p style={{ padding: 24, fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>
            {t('noRevenueLogsYet')}
          </p>
        ) : (
          <table className="kee-table">
            <thead>
              <tr>
                <th>{t('periodCol')}</th>
                <th>{t('notesCol')}</th>
                <th>{t('amountCol')}</th>
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
function KeysSearchView({ t, api, searchDispatch }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedResult, setSelectedResult] = useState(null);
  // Bumped on every search fired; a response is only applied if it's still
  // the most recent one requested. Without this, a slower response for an
  // earlier keystroke (e.g. "hon") can resolve after a faster response for a
  // later one (e.g. "honda") and overwrite the list with stale results while
  // the search box already shows the newer query.
  const searchTokenRef = useRef(0);

  // Debounced (350ms, matching the dashboard's global search) so typing a
  // query doesn't fire a fresh fetch on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch();
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Picks up a query dispatched from the global header search panel (filter = "Key").
  useEffect(() => {
    if (searchDispatch && searchDispatch.type === 'key') {
      setQuery(searchDispatch.query);
    }
  }, [searchDispatch?.nonce]);

  const performSearch = async () => {
    const token = ++searchTokenRef.current;
    setLoading(true);
    try {
      // Every result is a customer registration with a key code, scoped to
      // this shop admin's own shop server-side (see
      // AuthContext.getShopKeysCatalogue / CustomerController's keysOnly
      // param) - there's no separate "key blank with no customer" concept
      // to cross-reference anymore, so this is a single direct fetch.
      const res = await api.getShopKeysCatalogue({ search: query });
      if (token !== searchTokenRef.current) return;
      setResults(res);
    } catch (e) {
      if (token !== searchTokenRef.current) return;
      console.error(e);
      setResults([]);
    } finally {
      if (token === searchTokenRef.current) setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Search /> {t('duplicateKeyLookupLabel')}</div>
          <h1>{t('masterKeyCatalogSearchTitle')}</h1>
          <p>{t('lookupBlankSpecDesc')}</p>
        </div>
      </div>

      <div className="reg-section" style={{ marginBottom: 'clamp(16px, 4vw, 24px)' }}>
        <div className="reg-field" style={{ marginBottom: 0 }}>
          <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><Search /></div><b>{t('keyCodeVehicleCategoryLabel')}</b></div>
          <div className="search-box" style={{ width: '100%', minWidth: 0, background: 'var(--card-2)' }}>
            <Search />
            <input
              type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchByKeyCodePlaceholder')}
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
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('searchingRegistryMsg')}</span>
        </div>
      ) : results.length === 0 ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 220 }}>
          <div className="icon-badge rose"><KeyRound /></div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{t('noMatchingKeysMsg')}</span>
        </div>
      ) : (
        <div className="product-grid stagger-in">
          {results.map((c) => {
            const typeLabel = keyTypeDisplayLabel(t, c.vehicleCategory);
            return (
              <div
                key={c.id} onClick={() => setSelectedResult(c)}
                className="product-card"
                style={{ cursor: 'pointer' }}
              >
                <div className="product-img" style={{ background: 'var(--maroon)' }}>
                  <KeyRound style={{ color: '#ffffff' }} />
                  <span className="product-tag">{c.addKey ? t('addKeyLabel') : c.lostKey ? t('lostKeyLabel') : t('registeredKeyLabel')}</span>
                </div>
                <div className="product-body">
                  <span className="pname">{c.keyNumber}</span>
                  <p className="pcat">{c.name}</p>
                  {typeLabel && (
                    <span className="badge" style={{ alignSelf: 'flex-start', background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                      {typeLabel}
                    </span>
                  )}
                  <div className="product-foot" style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--gold)' }}>{t('viewFullDetailsLabel')}</span>
                    <ExternalLink style={{ width: 13, height: 13, color: 'var(--gold)' }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Details View Modal - read-only, no edit action */}
      {selectedResult && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.85)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 620, margin: 'auto', padding: 28 }}>
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><KeyRound /> {t('keyDetailsLabel')}</span>
                <h2 style={{ fontSize: 19 }}>{selectedResult.keyNumber}</h2>
              </div>
              <button onClick={() => setSelectedResult(null)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="reg-section" style={{ marginBottom: 0 }}>
              <div className="grid grid-cols-2 gap-4">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><User /></div><b>{t('customerNameLabel')}</b></div>
                  <span style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 12.5 }}>{selectedResult.name}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><Phone /></div><b>{t('phoneNumberLabel')}</b></div>
                  <span style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 12.5 }}>{selectedResult.phone}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Car /></div><b>{t('vehicleNumberLabel')}</b></div>
                  <span style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 12.5 }}>{selectedResult.vehicleNumber || 'N/A'}</span>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Calendar /></div><b>{t('registryDateLabel')}</b></div>
                  <span style={{ color: 'var(--text-1)', fontWeight: 600, fontSize: 12.5 }}>{new Date(selectedResult.createdAt).toLocaleDateString()}</span>
                </div>
                {keyTypeDisplayLabel(t, selectedResult.vehicleCategory) && (
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><KeyRound /></div><b>{t('keyTypeLabel')}</b></div>
                    <span style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 12.5 }}>{keyTypeDisplayLabel(t, selectedResult.vehicleCategory)}</span>
                  </div>
                )}
              </div>

              <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', padding: 14, borderRadius: 14, marginTop: 4 }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`icon-badge ${selectedResult.latitude ? 'jgreen' : 'rose'}`} style={{ width: 32, height: 32, borderRadius: 10 }}>
                      <MapPin style={{ width: 16, height: 16 }} />
                    </div>
                    <div>
                      <p style={{ fontWeight: 700, color: 'var(--text-0)', fontSize: 13 }}>{t('gpsCoordinatesLabel')}</p>
                      {selectedResult.latitude && selectedResult.longitude ? (
                        <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, fontWeight: 600 }}>{t('latLongTemplate').split('{lat}')[0]}{selectedResult.latitude}{t('latLongTemplate').split('{lat}')[1].split('{long}')[0]}{selectedResult.longitude}</p>
                      ) : (
                        <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, fontWeight: 600, fontStyle: 'italic' }}>{t('notCapturedLabel')}</p>
                      )}
                    </div>
                  </div>
                  {selectedResult.mapsLink && (
                    <a href={selectedResult.mapsLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10.5, color: 'var(--gold)', fontWeight: 800 }} className="flex items-center gap-1 hover:underline">
                      <span>{t('googleMapsLabel')}</span><ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                {selectedResult.capturedAddress && (
                  <div style={{ fontSize: 10.5, color: 'var(--text-2)', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8, paddingLeft: 42, fontWeight: 600 }}>
                    <span style={{ display: 'block', fontWeight: 800, fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase' }}>{t('capturedAddressLabel')}</span>
                    <span>{selectedResult.capturedAddress}</span>
                  </div>
                )}
              </div>

              <div className="reg-field" style={{ marginTop: 13, marginBottom: 0 }}>
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><Camera /></div><b>{t('webcamSnapshotLabel')}</b></div>
                {selectedResult.photoUrl ? (
                  <div style={{ width: '100%', height: 96, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-2)' }}>
                    <img src={getAssetUrl(selectedResult.photoUrl)} alt="Customer" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div style={{ width: '100%', height: 96, borderRadius: 12, border: '1.5px dashed var(--border-2)' }} className="flex items-center justify-center">
                    <Camera style={{ width: 16, height: 16, color: 'var(--text-3)' }} />
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
              <button onClick={() => setSelectedResult(null)} className="btn btn-ghost">
                {t('closeDetailsBtn')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function CustomerRegistrationWizard({ t, api, superAdminMode = false, shops = [], editCustomer = null, onDone, onCancel }) {
  const { user } = useAuth();
  const isEditMode = !!editCustomer;

  // Single-page form now (Review is a modal, not a separate step) - hardware
  // Back closes the Review modal if it's open; otherwise it falls through to
  // whatever is above this wizard (closes the superAdminMode overlay via its
  // own useBackHandler(showCreateWizard, ...), or pops the screen stack when
  // this is the plain 'register' tab).
  const [showReviewModal, setShowReviewModal] = useState(false);
  useBackHandler(showReviewModal, () => setShowReviewModal(false));
  const [keysList, setKeysList] = useState([]);

  // Super Admin only: which shop this customer is being registered under.
  // Required before Step 1 can be completed - see the Shop dropdown below.
  const [selectedShopId, setSelectedShopId] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [address, setAddress] = useState('N/A');
  const [idProofType, setIdProofType] = useState('Aadhaar Card');
  const [idProofNumber, setIdProofNumber] = useState('N/A');
  const [reason, setReason] = useState('N/A');
  const [keyNumber, setKeyNumber] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [addressLine, setAddressLine] = useState('');
  // Internal-only (not shown as its own field) - resolved from the reverse
  // geocode on "Current Location" purely to build the single Address field's
  // full text; India is the only country this app operates in.
  const [district, setDistrict] = useState('Chennai');
  const [country] = useState('India');
  const [masterKeyId, setMasterKeyId] = useState('');

  // 2-page wizard: Page 1 (customer details) -> Page 2 (category-specific
  // optional fields + documents). Hardware Back on Page 2 returns to Page 1
  // instead of exiting the wizard (see useBackHandler below).
  const [wizardPage, setWizardPage] = useState(1);
  useBackHandler(wizardPage === 2, () => setWizardPage(1));

  // Page 1's icon category selector - one of VEHICLE_CATEGORIES. Drives which
  // Page 2 field set is shown and the report's Automobile/Domestic grouping
  // (see utils/vehicleCategory.js - those words are never shown in the UI).
  const [vehicleCategory, setVehicleCategory] = useState('');
  const [addKey, setAddKey] = useState(false);
  const [lostKey, setLostKey] = useState(false);

  // Page 2 optional fields - each gated behind its own ON/OFF toggle,
  // defaulting OFF per the approved spec. Key Code is the SAME field for
  // both the Automobile "Key Code" and Home/Office "Home/Office Key Code"
  // labels (see keyNumber above).
  const [vehicleName, setVehicleName] = useState('');
  const [homeOfficeName, setHomeOfficeName] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [vehicleNumberEnabled, setVehicleNumberEnabled] = useState(false);
  const [vehicleNameEnabled, setVehicleNameEnabled] = useState(false);
  const [keyCodeEnabled, setKeyCodeEnabled] = useState(false);
  const [billAmountEnabled, setBillAmountEnabled] = useState(false);
  const [homeOfficeNameEnabled, setHomeOfficeNameEnabled] = useState(false);

  // OTP verification - shared OtpVerificationModal (Page 1's Mobile Number
  // field trigger), phone-only.
  const [otpVerified, setOtpVerified] = useState(false);
  const [showCustomerOtpModal, setShowCustomerOtpModal] = useState(false);
  const [duplicateKeyWarning, setDuplicateKeyWarning] = useState(false);

  // Document Uploads
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [uploadError, setUploadError] = useState('');

  // GPS Location Status
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [gpsError, setGpsError] = useState('');
  const [gpsErrorKind, setGpsErrorKind] = useState('');
  const [isCapturingGps, setIsCapturingGps] = useState(false);
  // Review step Download/Share - tracks which action is currently building
  // the PDF so both buttons can show a spinner and stay disabled mid-build.
  const [pdfAction, setPdfAction] = useState(null); // null | 'download' | 'share'
  // Cached shop info (name/address/phone) for the Download/Share report -
  // fetched lazily on first use rather than on mount, and refetched if the
  // Super Admin's selected shop changes.
  const [shopInfoForReport, setShopInfoForReport] = useState(null);
  const [shopInfoForReportShopId, setShopInfoForReportShopId] = useState(null);
  const [capturedAddress, setCapturedAddress] = useState('');
  // Post-submit confirmation - shown instead of a plain alert() so the
  // success state reads as part of the app's UI rather than a native dialog.
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  // Guards Save Record against double-clicks/duplicate submissions - stays
  // true for the whole create/update + document-upload sequence and only
  // clears on error (so the shop admin can retry) or once the success modal
  // is up (see handleFinalSubmit).
  const [savingRecord, setSavingRecord] = useState(false);

  // Populate wizard when editCustomer prop is supplied
  useEffect(() => {
    if (editCustomer) {
      setName(editCustomer.name || '');
      setPhone(editCustomer.phone || '');
      const addr = editCustomer.address || editCustomer.capturedAddress || '';
      setAddress(addr);
      setAddressLine(addr);
      setCapturedAddress(editCustomer.capturedAddress || addr);
      setIdProofType(editCustomer.idProofType || editCustomer.idType || 'Aadhaar Card');
      setIdProofNumber(editCustomer.idProofNumber || editCustomer.idNumber || '');
      setReason(editCustomer.reason || '');

      const cat = editCustomer.vehicleCategory || editCustomer.lockCategory || editCustomer.keyType || 'TWO_WHEELER';
      setVehicleCategory(cat);
      setAddKey(!!editCustomer.addKey);
      setLostKey(!!editCustomer.lostKey);

      setVehicleName(editCustomer.vehicleName || '');
      if (editCustomer.vehicleName) setVehicleNameEnabled(true);

      setHomeOfficeName(editCustomer.homeOfficeName || '');
      if (editCustomer.homeOfficeName) setHomeOfficeNameEnabled(true);

      setVehicleNumber(editCustomer.vehicleNumber || '');
      if (editCustomer.vehicleNumber) setVehicleNumberEnabled(true);

      const kNum = editCustomer.keyNumber || editCustomer.keyCode || '';
      setKeyNumber(kNum);
      if (kNum) setKeyCodeEnabled(true);

      if (editCustomer.billAmount != null && editCustomer.billAmount !== '') {
        setBillAmount(String(editCustomer.billAmount));
        setBillAmountEnabled(true);
      }

      setLatitude(editCustomer.latitude || null);
      setLongitude(editCustomer.longitude || null);

      if (editCustomer.shopId || editCustomer.shop?.id) {
        setSelectedShopId(editCustomer.shopId || editCustomer.shop?.id);
      }
    }
  }, [editCustomer]);

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

  // The single Address field IS the address now - district/state are resolved
  // internally (see captureCustomerLocation below) purely to help compose its
  // text on "Current Location", not tracked as separate fields anymore.
  useEffect(() => {
    if (addressLine) {
      setAddress(addressLine);
      setCapturedAddress(addressLine);
    }
  }, [addressLine]);

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
    const data = await reverseGeocode(lat, lng);
    if (data) {
      // District is resolved here purely as internal state (not rendered as
      // its own field anymore) - matching against INDIAN_STATES_DISTRICTS is
      // kept only to normalize the state name the same way it always has,
      // in case it's needed elsewhere later.
      const matchedState = Object.keys(INDIAN_STATES_DISTRICTS).find(
        st => st.toLowerCase() === (data.state || '').toLowerCase()
      );
      if (matchedState) {
        const list = INDIAN_STATES_DISTRICTS[matchedState] || [];
        // Nominatim's district name often carries a "District"/"Taluk"/
        // "Tehsil" suffix (e.g. "Chennai District") that our district list
        // doesn't, so strip that before comparing. Try an exact match first,
        // then fall back to a loose substring match (handles minor naming
        // differences like "Bengaluru" vs "Bengaluru Urban").
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
      // (street, locality, city, district, state, postcode, country in
      // order) - use it directly to fill the single Address field, falling
      // back to the street/locality/city if a full formatted string wasn't
      // available for this point.
      const fullAddress = data.displayName || data.street || data.locality || data.city;
      if (fullAddress) {
        setAddressLine(fullAddress);
        setCapturedAddress(fullAddress);
      }
    }
    setIsCapturingGps(false);
  };

  const handleDocumentFile = (file) => {
    setUploadError('');
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setUploadError(t('fileSizeExceeds5MBMsg'));
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError(t('onlyJpegPngPdfMsg'));
      return;
    }

    if (uploadedDocs.some(d => d.type === idProofType)) {
      setUploadError(t('documentAlreadyStagedTemplate').replace('{type}', idProofType));
      return;
    }

    const newDocs = [...uploadedDocs, { type: idProofType, file }];
    setUploadedDocs(newDocs);

    const remaining = ALL_DOC_TYPES.filter(
      t => !newDocs.some(d => d.type === t)
    );
    if (remaining.length > 0) {
      setIdProofType(remaining[0]);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    handleDocumentFile(file);
  };

  const handleCaptureDocumentPhoto = async () => {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        quality: 85,
      });
      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      const file = new File([blob], `${idProofType.replace(/\s+/g, '_').toLowerCase()}.${photo.format || 'jpg'}`, { type: blob.type || 'image/jpeg' });
      handleDocumentFile(file);
    } catch (err) {
      // User cancelling the native camera sheet rejects the promise - not a
      // real error, so only surface genuine failures.
      if (err && err.message && !/cancell?ed/i.test(err.message)) {
        setUploadError(err.message || t('documentUploadFailedMsg'));
      }
    }
  };

  // Page 1's Mobile Number OTP trigger - actual send/verify/resend/countdown
  // lives in the shared OtpVerificationModal (see showCustomerOtpModal below).
  // Always opens the popup - see handleOpenRegOtpModal's comment above.
  const handleOpenCustomerOtpModal = () => {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setPhoneError(PHONE_REGEX_MESSAGE);
      return;
    }
    setPhoneError('');
    if (normalized !== phone) setPhone(normalized);
    setShowCustomerOtpModal(true);
  };

  // Duplicate-key check, relocated here (from the old OTP-send handler) since
  // Key Code now lives on Page 2, entered after phone/OTP verification. Fired
  // on the Key Code field's blur (see Page 2 below).
  const checkDuplicateKey = async (value) => {
    if (!value) {
      setDuplicateKeyWarning(false);
      return;
    }
    try {
      // Passes the typed value as the search term so the backend filters
      // server-side (WHERE keyNumber contains ...) instead of fetching every
      // customer on the shop - or, for Super Admin, on the ENTIRE PLATFORM -
      // just to run this exact-match check client-side over the full result.
      const candidates = superAdminMode ? await api.getSuperCustomers(value) : await api.getCustomers(value);
      const duplicate = candidates.find(c => c.keyNumber && c.keyNumber.toLowerCase() === value.trim().toLowerCase());
      setDuplicateKeyWarning(!!duplicate);
    } catch (e) {
      console.warn('Duplicate key validation check skipped:', e);
    }
  };

  const handleFinalSubmit = async () => {
    if (savingRecord) return;
    setSavingRecord(true);
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

      // Toggled-OFF Page 2 fields are hidden entirely, but their state can
      // still hold a stale value from a quick off->on->off toggle - map them
      // to null here regardless of what's in state, so only fields the shop
      // admin actually left switched on ever reach the backend.
      const isAutomobile = isAutomobileCategory(vehicleCategory);
      const finalKeyNumber = keyCodeEnabled ? (keyNumber || null) : null;
      const finalVehicleNumber = (isAutomobile && vehicleNumberEnabled) ? (vehicleNumber || null) : null;
      const finalVehicleName = (isAutomobile && vehicleNameEnabled) ? (vehicleName || null) : null;
      const finalHomeOfficeName = (!isAutomobile && homeOfficeNameEnabled) ? (homeOfficeName || null) : null;
      const finalBillAmount = billAmountEnabled && billAmount ? Number(billAmount) : null;

      // If the typed key number matches an existing catalog entry, reference it
      // directly. Otherwise, send the "register this as a new key blank" details
      // inline as `manualKey` so the backend creates the MasterKey row in the SAME
      // transaction as the customer record — it can never be persisted without an
      // owning customer this way. (Previously this made a separate createShopKey()
      // call before createCustomer(); if the customer request failed afterwards for
      // any reason, the key row was left permanently orphaned with no customer.)
      let matchKey = finalKeyNumber ? keysList.find(k => k.keyNumber.toLowerCase() === finalKeyNumber.toLowerCase()) : null;
      let finalMasterKeyId = finalKeyNumber ? (masterKeyId || null) : null;
      let manualKey = null;

      if (!matchKey && finalKeyNumber) {
        manualKey = {
          category: isAutomobile ? 'Vehicle Keys' : 'Home/Office Keys',
        };
      } else if (matchKey) {
        finalMasterKeyId = matchKey.id;
      }

      const payload = {
        name, phone, address, idProofType, idProofNumber, reason,
        keyNumber: finalKeyNumber, vehicleNumber: finalVehicleNumber,
        vehicleName: finalVehicleName, homeOfficeName: finalHomeOfficeName,
        billAmount: finalBillAmount, addKey, lostKey, vehicleCategory,
        masterKeyId: finalMasterKeyId, manualKey,
        latitude: finalLat,
        longitude: finalLng,
        mapsLink: (finalLat && finalLng) ? `https://www.google.com/maps?q=${finalLat},${finalLng}` : null,
        capturedAddress: capturedAddress || address || null,
      };

      let customer;
      if (isEditMode) {
        if (superAdminMode && api.updateSuperCustomer) {
          customer = await api.updateSuperCustomer(editCustomer.id, { ...payload, ...(selectedShopId ? { shopId: selectedShopId } : {}) });
        } else {
          customer = await api.updateCustomer(editCustomer.id, payload);
        }
      } else {
        customer = superAdminMode
          ? await api.createSuperCustomer({ shopId: selectedShopId, ...payload })
          : await api.createCustomer(payload);
      }

      for (const doc of uploadedDocs) {
        await api.uploadDocument(customer.id, doc.type, doc.file);
      }

      window.dispatchEvent(new CustomEvent('customer_updated'));
      setShowSuccessModal(true);
      setSavingRecord(false);
    } catch (e) {
      setSavingRecord(false);
      alert(t('submissionFailedTemplate').replace('{message}', e.message));
    }
  };

  // OK on the post-submit success modal - runs the same follow-up the old
  // alert()'s dismissal used to trigger immediately.
  const handleSuccessModalOk = () => {
    setShowSuccessModal(false);
    if (onDone) {
      onDone(editCustomer || null);
    } else {
      resetWizard();
    }
  };

  const resetWizard = () => {
    setSelectedShopId('');
    setWizardPage(1);
    setVehicleCategory('');
    setAddKey(false);
    setLostKey(false);
    setName('');
    setPhone('');
    setAddress('N/A');
    setIdProofType('Aadhaar Card');
    setIdProofNumber('N/A');
    setReason('N/A');
    setKeyNumber('');
    setVehicleNumber('');
    setVehicleName('');
    setHomeOfficeName('');
    setBillAmount('');
    setVehicleNumberEnabled(false);
    setVehicleNameEnabled(false);
    setKeyCodeEnabled(false);
    setBillAmountEnabled(false);
    setHomeOfficeNameEnabled(false);
    setAddressLine('');
    setDistrict('');
    setOtpVerified(false);
    setShowCustomerOtpModal(false);
    setDuplicateKeyWarning(false);
    setUploadedDocs([]);
    setLatitude(null);
    setLongitude(null);
    setGpsError('');
    setCapturedAddress('');
    setShowReviewModal(false);
  };

  // Mirrors CustomerHistoryView's ensureShopInfo() - fetches once (or again
  // if the Super Admin switches shops) rather than on every click.
  const ensureShopInfoForReport = async () => {
    const targetShopId = superAdminMode ? selectedShopId : null;
    if (shopInfoForReport && shopInfoForReportShopId === targetShopId) return shopInfoForReport;
    try {
      const res = await api.getSettings(superAdminMode ? selectedShopId : undefined);
      let address = 'N/A';
      let phone = 'N/A';
      if (res.companyDetails) {
        try {
          const details = JSON.parse(res.companyDetails);
          address = details.address || 'N/A';
          phone = details.phone || 'N/A';
        } catch (e) { /* leave defaults */ }
      }
      const info = { name: res.name, address, phone };
      setShopInfoForReport(info);
      setShopInfoForReportShopId(targetShopId);
      return info;
    } catch (e) {
      console.error('Failed to load shop info for report:', e);
      return { name: superAdminMode ? (shops.find(s => s.id === selectedShopId)?.name || 'N/A') : 'N/A', address: 'N/A', phone: 'N/A' };
    }
  };

  // Review/Download/Share build the same branded Customer Registration
  // Report template Customer History uses (see customerReportPdf.js),
  // instead of a separate plain-text layout, so the document a shop admin
  // gets here looks identical to the one downloaded later from history.
  // uploadedDocs are still local { type, file } File objects at this point
  // (upload only happens after Submit) - buildCustomerReportPdf reads those
  // directly, no network fetch needed.
  const buildDraftReportPdf = async () => {
    const shop = await ensureShopInfoForReport();
    const isAutomobile = isAutomobileCategory(vehicleCategory);
    const finalKeyNumber = keyCodeEnabled ? (keyNumber || null) : null;
    const matchKey = finalKeyNumber ? keysList.find(k => k.keyNumber.toLowerCase() === finalKeyNumber.toLowerCase()) : null;
    const customerLike = {
      name, phone,
      vehicleNumber: (isAutomobile && vehicleNumberEnabled) ? vehicleNumber : null,
      vehicleName: (isAutomobile && vehicleNameEnabled) ? vehicleName : null,
      homeOfficeName: (!isAutomobile && homeOfficeNameEnabled) ? homeOfficeName : null,
      keyNumber: finalKeyNumber,
      billAmount: billAmountEnabled && billAmount ? Number(billAmount) : null,
      addKey, lostKey, vehicleCategory,
      address: addressLine, capturedAddress: capturedAddress || addressLine,
      latitude, longitude, reason,
      photoUrl: null,
      masterKey: { category: matchKey?.category || (isAutomobile ? 'Vehicle Keys' : 'Home/Office Keys') },
      createdAt: new Date().toISOString(),
      documents: uploadedDocs,
    };
    const { buildCustomerReportPdf } = await import('./utils/customerReportPdf');
    return buildCustomerReportPdf({ customer: customerLike, shop, registeredByName: user?.name });
  };

  // Reusing apiConfig.js's downloadAsset() native save flow (write to cache ->
  // SaveToDownloads plugin -> share sheet fallback) since it's the
  // already-proven way to get a file out of this app's sandbox.
  const handleDownloadRegistration = async () => {
    setPdfAction('download');
    try {
      const pdf = await buildDraftReportPdf();
      const safeName = `${(name || 'Customer').trim().replace(/[^a-zA-Z0-9_\-\s]+/g, '').replace(/\s+/g, '_')}.pdf`;
      await downloadPdf(pdf, safeName);
    } catch (err) {
      console.error('Failed to generate registration PDF:', err);
      window.alert('Could not generate the registration PDF. Please try again.');
    } finally {
      setPdfAction(null);
    }
  };

  const handleShareRegistration = async () => {
    setPdfAction('share');
    try {
      const pdf = await buildDraftReportPdf();
      const shop = await ensureShopInfoForReport();
      const isAutomobile = isAutomobileCategory(vehicleCategory);
      const finalKeyNumber = keyCodeEnabled ? (keyNumber || null) : null;
      const safeName = `${(name || 'Customer').trim().replace(/[^a-zA-Z0-9_\-\s]+/g, '').replace(/\s+/g, '_')}.pdf`;
      const queryParams = new URLSearchParams({
        action: 'download_doc',
        name: name || 'Customer',
        phone: phone || '',
        keyNumber: finalKeyNumber || '',
        vehicleNumber: (isAutomobile && vehicleNumberEnabled) ? vehicleNumber : '',
        billAmount: (billAmountEnabled && billAmount) ? billAmount : '',
        address: capturedAddress || addressLine || '',
        shopName: shop?.name || 'Key Shops',
        vehicleCategory: vehicleCategory || '',
      }).toString();
      const downloadUrl = `https://keee-7d6cb.web.app/?${queryParams}`;
      const shareMsg = `Hi ${name || 'Customer'},\nThank you for choosing Key Shops. Please find your key registration document attached. You can also download it anytime using the link below.\n${downloadUrl}`;
      if (Capacitor.isNativePlatform()) {
        await sharePdf(pdf, safeName, { title: 'Key Registration Document', fallbackText: shareMsg });
      } else {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareMsg)}`, '_blank');
        await downloadPdf(pdf, safeName);
      }
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        console.error('Failed to share registration PDF:', err);
        window.alert('Could not share the registration PDF. Please try again.');
      }
    } finally {
      setPdfAction(null);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-head reg-wizard-head">
        <div>
          <div className="eyebrow"><UserPlus /> {isEditMode ? 'EDIT CUSTOMER REGISTRATION' : t('newCustomerEyebrow')}</div>
          <h1>{isEditMode ? `Edit Customer (${name || 'Details'})` : t('register')}</h1>
        </div>
        {(superAdminMode || isEditMode) && onCancel && (
          <button type="button" onClick={onCancel} className="btn btn-ghost">
            <X className="h-4 w-4" /><span>{t('btnCancel')}</span>
          </button>
        )}
      </div>

      <div className="card wizard-card">
        <div className="wizard-body reg-compact">
          {superAdminMode && (
            <div className="reg-section">
              <div className="reg-field">
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><Store /></div><b>{t('shopFieldLabel')} <span className="req">*</span></b></div>
                <CustomSelect
                  value={selectedShopId} onChange={setSelectedShopId}
                  placeholder={t('selectShopPlaceholder')}
                  options={shops.map(s => ({ value: s.id, label: s.name }))}
                />
                <p style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginTop: 8 }}>
                  {t('customerRegisteredUnderShopMsg')}
                </p>
              </div>
            </div>
          )}

          {wizardPage === 1 && (
            <>
              <div className="reg-section">
                <div className="category-icon-grid">
                  {[
                    { value: VEHICLE_CATEGORIES.TWO_WHEELER, img: twoWheelerIcon, label: t('twoWheelerLabel') },
                    { value: VEHICLE_CATEGORIES.FOUR_WHEELER, img: fourWheelerIcon, label: t('fourWheelerLabel') },
                    { value: VEHICLE_CATEGORIES.TRUCK_LORRY, img: truckLorryIcon, label: t('truckLorryLabel') },
                    { value: VEHICLE_CATEGORIES.HOME, img: homeCategoryIcon, label: t('homeCategoryLabel') },
                    { value: VEHICLE_CATEGORIES.OFFICE, img: officeCategoryIcon, label: t('officeCategoryLabel') },
                  ].map((cat) => (
                    <button
                      type="button" key={cat.value}
                      className={`category-icon-btn ${vehicleCategory === cat.value ? 'active' : ''}`}
                      onClick={() => setVehicleCategory(cat.value)}
                    >
                      <img src={cat.img} alt={cat.label} />
                      <span>{cat.label}</span>
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button" className={`choice-btn add-key-btn ${addKey ? 'active' : ''}`} style={{ flex: 1 }}
                    onClick={() => setAddKey(!addKey)} aria-pressed={addKey}
                  >
                    <img src={addKeyIcon} alt="" />
                    <span>{t('addKeyLabel')}</span>
                  </button>
                  <button
                    type="button" className={`choice-btn lost-key-btn ${lostKey ? 'active' : ''}`} style={{ flex: 1 }}
                    onClick={() => setLostKey(!lostKey)} aria-pressed={lostKey}
                  >
                    <img src={lostKeyIcon} alt="" />
                    <span>{t('lostKeyLabel')}</span>
                  </button>
                </div>
              </div>

              <div className="reg-section">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><User /></div><b>{t('fullCustomerNameLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder={t('customerNamePlaceholderEg')} />
                  </div>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Phone /></div><b>{t('phoneNumberLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="tel" required value={phone}
                      onChange={(e) => { setPhone(e.target.value); setOtpVerified(false); setPhoneError(''); }}
                      placeholder={t('phoneNumberPlaceholderEg')}
                    />
                  </div>
                  {phoneError && (
                    <span style={{ display: 'block', marginTop: 6, fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>{phoneError}</span>
                  )}
                  {!otpVerified && (
                    <button type="button" onClick={handleOpenCustomerOtpModal} className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 8 }}>
                      {t('sendOtpToVerifyBtn')}
                    </button>
                  )}
                  {otpVerified && (
                    <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--green)' }} />
                      <span style={{ color: 'var(--green)', fontSize: 12, fontWeight: 700 }}>{t('mobileNumberVerifiedMsg')}</span>
                    </div>
                  )}
                  <Suspense fallback={null}>
                  <OtpVerificationModal
                    open={showCustomerOtpModal}
                    onClose={() => setShowCustomerOtpModal(false)}
                    onVerified={() => setOtpVerified(true)}
                    api={api}
                    identifier={phone}
                    method="phone"
                    purpose="customer_verify"
                    title={t('verifyOtpModalTitle')}
                    description={t('enterOtpCodeSentToPhoneTemplate').replace('{phone}', phone)}
                    t={t}
                  />
                  </Suspense>
                </div>
                <div className="reg-field" style={{ marginBottom: 0 }}>
                  <div className="reg-field-label">
                    <div className="reg-ico" style={{ background: 'var(--teal)' }}><MapPin /></div>
                    <b>{t('addressLineLabel')} <span className="req">*</span></b>
                    <button
                      type="button"
                      onClick={captureCustomerLocation}
                      disabled={isCapturingGps}
                      className="reg-trailing loc-btn"
                    >
                      <Crosshair className={isCapturingGps ? 'animate-spin' : ''} />
                      <span>{isCapturingGps ? t('locatingLabel') : t('currentLocationBtn')}</span>
                    </button>
                  </div>
                  <div className="input-wrap">
                    <input
                      type="text" required value={addressLine}
                      onChange={(e) => {
                        setAddressLine(e.target.value);
                        // Manual entry supersedes a failed GPS lookup - clear the stale
                        // error banner instead of leaving it displayed indefinitely.
                        if (gpsError) {
                          setGpsError('');
                          setGpsErrorKind('');
                        }
                      }}
                      placeholder={t('addressLinePlaceholderEg')}
                    />
                  </div>
                  {latitude && longitude && !gpsError && (
                    <p style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginTop: 6 }}>{t('gpsCapturedTemplate').split('{lat}')[0]}{latitude.toFixed(5)}{t('gpsCapturedTemplate').split('{lat}')[1].split('{long}')[0]}{longitude.toFixed(5)}</p>
                  )}
                </div>
              </div>

              <div className="wizard-foot">
                <span />
                <button
                  type="button" className="btn btn-primary" style={{ minWidth: 150 }}
                  disabled={!vehicleCategory || !name || !phone || !otpVerified || !addressLine || (superAdminMode && !selectedShopId)}
                  onClick={() => setWizardPage(2)}
                >
                  {t('btnNext')} <ArrowRight style={{ width: 18, height: 18 }} />
                </button>
              </div>
            </>
          )}

          {wizardPage === 2 && (
            <>
              {duplicateKeyWarning && (
                <div className="animate-fade-in" style={{ display: 'flex', gap: 12, background: 'var(--red-dim)', border: '1px solid rgba(242,86,77,0.3)', borderRadius: 16, padding: 16, marginBottom: 20 }}>
                  <div className="icon-badge red" style={{ width: 36, height: 36, borderRadius: 11 }}><AlertTriangle className="h-4 w-4" /></div>
                  <div>
                    <div style={{ color: 'var(--red)', fontWeight: 800, fontSize: 13, fontFamily: 'var(--display)' }}>{t('duplicateKeyDetectedLabel')}</div>
                    <p style={{ color: 'var(--text-2)', fontSize: 12, fontWeight: 600, marginTop: 4, lineHeight: 1.5 }}>
                      {t('duplicateKeyDetectedDescTemplate').split('{code}')[0]}<b style={{ color: 'var(--text-0)' }}>{keyNumber}</b>{t('duplicateKeyDetectedDescTemplate').split('{code}')[1]}
                    </p>
                  </div>
                </div>
              )}

              <div className="reg-section">
                {isAutomobileCategory(vehicleCategory) ? (
                  <>
                    <div className="reg-field">
                      <div className="toggle-field-row">
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Car /></div><b>{t('vehicleNumberLabel')}</b></div>
                        <button type="button" className={`toggle-switch ${vehicleNumberEnabled ? 'on' : ''}`} onClick={() => setVehicleNumberEnabled(!vehicleNumberEnabled)} aria-pressed={vehicleNumberEnabled}>
                          <span className="toggle-thumb" />
                        </button>
                      </div>
                      {vehicleNumberEnabled && (
                        <div className="input-wrap">
                          <input type="text" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())} placeholder={t('vehicleNumberLabel')} />
                        </div>
                      )}
                    </div>
                    <div className="reg-field">
                      <div className="toggle-field-row">
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Car /></div><b>{t('vehicleNameLabel')}</b></div>
                        <button type="button" className={`toggle-switch ${vehicleNameEnabled ? 'on' : ''}`} onClick={() => setVehicleNameEnabled(!vehicleNameEnabled)} aria-pressed={vehicleNameEnabled}>
                          <span className="toggle-thumb" />
                        </button>
                      </div>
                      {vehicleNameEnabled && (
                        <div className="input-wrap">
                          <input type="text" value={vehicleName} onChange={(e) => setVehicleName(e.target.value)} placeholder={t('vehicleNameLabel')} />
                        </div>
                      )}
                    </div>
                    <div className="reg-field">
                      <div className="toggle-field-row">
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><KeyRound /></div><b>{t('keyCodeKeyNumberLabel')}</b></div>
                        <button type="button" className={`toggle-switch ${keyCodeEnabled ? 'on' : ''}`} onClick={() => setKeyCodeEnabled(!keyCodeEnabled)} aria-pressed={keyCodeEnabled}>
                          <span className="toggle-thumb" />
                        </button>
                      </div>
                      {keyCodeEnabled && (
                        <div className="input-wrap">
                          <input
                            type="text" value={keyNumber}
                            onChange={(e) => { setKeyNumber(e.target.value); setDuplicateKeyWarning(false); }}
                            onBlur={(e) => checkDuplicateKey(e.target.value)}
                            placeholder={t('keyCodeEnterPlaceholderEg')}
                          />
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="reg-field">
                      <div className="toggle-field-row">
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Home /></div><b>{t('homeOfficeNameLabel')}</b></div>
                        <button type="button" className={`toggle-switch ${homeOfficeNameEnabled ? 'on' : ''}`} onClick={() => setHomeOfficeNameEnabled(!homeOfficeNameEnabled)} aria-pressed={homeOfficeNameEnabled}>
                          <span className="toggle-thumb" />
                        </button>
                      </div>
                      {homeOfficeNameEnabled && (
                        <div className="input-wrap">
                          <input type="text" value={homeOfficeName} onChange={(e) => setHomeOfficeName(e.target.value)} placeholder={t('homeOfficeNameLabel')} />
                        </div>
                      )}
                    </div>
                    <div className="reg-field">
                      <div className="toggle-field-row">
                        <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><KeyRound /></div><b>{t('homeOfficeKeyCodeLabel')}</b></div>
                        <button type="button" className={`toggle-switch ${keyCodeEnabled ? 'on' : ''}`} onClick={() => setKeyCodeEnabled(!keyCodeEnabled)} aria-pressed={keyCodeEnabled}>
                          <span className="toggle-thumb" />
                        </button>
                      </div>
                      {keyCodeEnabled && (
                        <div className="input-wrap">
                          <input
                            type="text" value={keyNumber}
                            onChange={(e) => { setKeyNumber(e.target.value); setDuplicateKeyWarning(false); }}
                            onBlur={(e) => checkDuplicateKey(e.target.value)}
                            placeholder={t('keyCodeEnterPlaceholderEg')}
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}
                <div className="reg-field" style={{ marginBottom: 0 }}>
                  <div className="toggle-field-row">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><IndianRupee /></div><b>{t('billAmountLabel')}</b></div>
                    <button type="button" className={`toggle-switch ${billAmountEnabled ? 'on' : ''}`} onClick={() => setBillAmountEnabled(!billAmountEnabled)} aria-pressed={billAmountEnabled}>
                      <span className="toggle-thumb" />
                    </button>
                  </div>
                  {billAmountEnabled && (
                    <div className="input-wrap">
                      <input type="number" min="0" step="0.01" value={billAmount} onChange={(e) => setBillAmount(e.target.value)} placeholder={t('billAmountLabel')} />
                    </div>
                  )}
                </div>
              </div>

              <div className="reg-section">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><FileCheck /></div><b>{t('documentTypeLabel')}</b></div>
                  <CustomSelect
                    value={idProofType} onChange={setIdProofType}
                    options={ALL_DOC_TYPES.map(dt => ({
                      value: dt,
                      label: dt,
                      disabled: uploadedDocs.some(d => d.type === dt)
                    }))}
                  />
                </div>
                {IS_NATIVE_APP && (
                  <button type="button" onClick={handleCaptureDocumentPhoto} className="btn btn-outline btn-sm" style={{ marginBottom: 12 }}>
                    <Camera className="h-4 w-4" /> {t('useCameraBtn')}
                  </button>
                )}
                <label htmlFor="docUploadInput" className="dropzone">
                  <div className="icon-badge orange"><UploadCloud className="h-5 w-5" /></div>
                  <div className="dz-title">{t('dropOrBrowseCopyTemplate').replace('{type}', idProofType)}</div>
                  <div className="dz-sub">{t('jpegPngPdfUpTo5MbLabel')}</div>
                  <input type="file" id="docUploadInput" onClick={primeStoragePermission} onChange={handleFileChange} style={{ display: 'none' }} accept="image/jpeg, image/png, application/pdf" />
                </label>
                {uploadError && <p style={{ color: 'var(--red)', fontSize: 12, fontWeight: 700, marginTop: 12, textAlign: 'center' }}>{uploadError}</p>}

                {uploadedDocs.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
                    <span className="side-section-label" style={{ padding: 0 }}>{t('stagedIdCopiesTemplate').replace('{count}', uploadedDocs.length)}</span>
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

              <div className="wizard-foot">
                <button type="button" onClick={() => setWizardPage(1)} className="btn btn-ghost">
                  <ArrowLeft style={{ width: 18, height: 18 }} /> {t('btnBack')}
                </button>
                <div className="wizard-foot-right" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => setShowReviewModal(true)} className="reg-action-btn review" title={t('reviewStepLabel')}>
                    <Eye />
                  </button>
                  <button type="button" onClick={handleDownloadRegistration} disabled={pdfAction !== null} className="reg-action-btn download" title={t('downloadBtn')}>
                    {pdfAction === 'download' ? <RefreshCw className="animate-spin" /> : <Download />}
                  </button>
                  <button type="button" onClick={handleShareRegistration} disabled={pdfAction !== null} className="reg-action-btn share" title={t('shareViaWhatsAppBtn')}>
                    {pdfAction === 'share' ? <RefreshCw className="animate-spin" /> : (
                      <svg viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /><path d="M12.004 2C6.486 2 2 6.486 2 12.004c0 1.85.505 3.649 1.462 5.207L2 22l4.933-1.437a9.96 9.96 0 0 0 5.071 1.39h.004c5.518 0 10.004-4.486 10.004-10.005C22.012 6.486 17.522 2 12.004 2zm0 18.155h-.003a8.14 8.14 0 0 1-4.153-1.14l-.298-.177-3.09.9.918-3.02-.194-.309a8.13 8.13 0 0 1-1.257-4.405c0-4.494 3.657-8.15 8.156-8.15 2.178 0 4.225.85 5.766 2.393a8.096 8.096 0 0 1 2.386 5.762c-.002 4.494-3.658 8.15-8.156 8.15z" /></svg>
                    )}
                  </button>
                  <button
                    type="button" className="btn btn-primary"
                    disabled={savingRecord || duplicateKeyWarning || (superAdminMode && !selectedShopId && !isEditMode)}
                    onClick={handleFinalSubmit}
                    title={savingRecord ? t('savingRecordBtn') : (isEditMode ? 'Update Customer' : t('saveRecordBtn'))}
                    style={{ minWidth: 150 }}
                  >
                    {savingRecord ? (
                      <RefreshCw style={{ width: 20, height: 20 }} className="animate-spin" />
                    ) : (
                      isEditMode ? <Check style={{ width: 20, height: 20 }} /> : <Save style={{ width: 20, height: 20 }} />
                    )}
                    {savingRecord ? t('savingRecordBtn') : (isEditMode ? 'Update Customer' : t('saveRecordBtn'))}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showReviewModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(5,4,3,0.72)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto', padding: 28 }}>
            <div className="flex items-center justify-between flex-wrap" style={{ gap: 12 }}>
              <div>
                <h3>{t('reviewStepLabel')}</h3>
                <p className="desc" style={{ marginBottom: 0 }}>{t('verifyDetailsBeforeSubmitDesc')}</p>
              </div>
              <button type="button" onClick={() => setShowReviewModal(false)} className="icon-btn" title={t('btnClose')}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="reg-section" style={{ marginTop: 20 }}>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="icon-badge purple" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }}><User style={{ width: 16, height: 16 }} /></div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>{t('reviewCustomerLabel')}</div>
                    <div style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 13.5 }}>{name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="icon-badge blue" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }}><Phone style={{ width: 16, height: 16 }} /></div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>{t('reviewPhoneLabel')}</div>
                    <div style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 13.5 }}>{phone}</div>
                  </div>
                </div>
                {isAutomobileCategory(vehicleCategory) ? (
                  <>
                    {vehicleNumberEnabled && (
                      <div className="flex items-center gap-3">
                        <div className="icon-badge orange" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }}><Car style={{ width: 16, height: 16 }} /></div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>{t('vehicleNumberLabel')}</div>
                          <div style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 13.5 }}>{vehicleNumber}</div>
                        </div>
                      </div>
                    )}
                    {vehicleNameEnabled && (
                      <div className="flex items-center gap-3">
                        <div className="icon-badge skyblue" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }}><Car style={{ width: 16, height: 16 }} /></div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>{t('vehicleNameLabel')}</div>
                          <div style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 13.5 }}>{vehicleName}</div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  homeOfficeNameEnabled && (
                    <div className="flex items-center gap-3">
                      <div className="icon-badge orange" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }}><Home style={{ width: 16, height: 16 }} /></div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>{t('homeOfficeNameLabel')}</div>
                        <div style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 13.5 }}>{homeOfficeName}</div>
                      </div>
                    </div>
                  )
                )}
                {keyCodeEnabled && (
                  <div className="flex items-center gap-3">
                    <div className="icon-badge pink" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }}><KeyRound style={{ width: 16, height: 16 }} /></div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                        {isAutomobileCategory(vehicleCategory) ? t('keyCodeKeyNumberLabel') : t('homeOfficeKeyCodeLabel')}
                      </div>
                      <div style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 13.5 }}>{keyNumber}</div>
                    </div>
                  </div>
                )}
                {billAmountEnabled && (
                  <div className="flex items-center gap-3">
                    <div className="icon-badge jgreen" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }}><IndianRupee style={{ width: 16, height: 16 }} /></div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>{t('billAmountLabel')}</div>
                      <div style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 13.5 }}>{billAmount}</div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3" style={{ marginTop: 16 }}>
                <div className="icon-badge teal" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }}><MapPin style={{ width: 16, height: 16 }} /></div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>{t('registeredAddressLabel')}</div>
                  <div style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 13.5 }}>{addressLine}</div>
                </div>
              </div>
            </div>

            <div className="reg-section">
              <div className="flex items-center gap-3" style={{ marginBottom: uploadedDocs.length > 0 ? 14 : 0 }}>
                <div className="icon-badge rose" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }}><FileCheck style={{ width: 16, height: 16 }} /></div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>{t('uploadedDocumentsLabel')}</div>
                  <div style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: 13.5 }}>{uploadedDocs.length > 0 ? t('filesAttachedTemplate').replace('{count}', uploadedDocs.length) : t('noneAttachedLabel')}</div>
                </div>
              </div>
              {uploadedDocs.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {uploadedDocs.map((doc, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 13, padding: '10px 14px' }}>
                      <span style={{ color: 'var(--gold)', fontWeight: 800, fontSize: 12.5, fontFamily: 'var(--display)' }}>{doc.type}</span>
                      <span style={{ color: 'var(--text-3)', fontSize: 12, fontWeight: 600, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.file.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <span className="side-section-label" style={{ padding: 0, display: 'block', marginBottom: 12 }}>{t('reviewLocationLabel')}</span>
            {latitude && longitude ? (
              <div className="loc-box">
                <div className="loc-info">
                  <div className="icon-badge green"><Crosshair className="h-5 w-5" /></div>
                  <div className="loc-text">
                    <div className="t1">{t('gpsCapturedHeadingLabel')}</div>
                    <div className="t2">{t('latLongMiddotTemplate').split('{lat}')[0]}{Number(latitude).toFixed(5)}{t('latLongMiddotTemplate').split('{lat}')[1].split('{long}')[0]}{Number(longitude).toFixed(5)}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 16, padding: 16 }}>
                <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>
                  {t('noGpsLocationCapturedDesc')}
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
        </div>,
        document.body
      )}

      {gpsError && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(5,4,3,0.72)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 400, padding: 28, textAlign: 'center' }}>
            <div
              className={`icon-badge ${gpsErrorKind === 'disabled' ? 'skyblue' : gpsErrorKind === 'permission' ? 'orange' : 'rose'}`}
              style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 18px' }}
            >
              {gpsErrorKind === 'disabled' ? <Navigation style={{ width: 26, height: 26 }} /> : gpsErrorKind === 'permission' ? <Lock style={{ width: 26, height: 26 }} /> : <AlertTriangle style={{ width: 26, height: 26 }} />}
            </div>
            <h3 style={{ marginBottom: 8 }}>
              {gpsErrorKind === 'disabled' ? t('locationServicesDisabledTitle') : gpsErrorKind === 'permission' ? t('locationPermissionRequiredTitle') : t('locationUnavailableTitle')}
            </h3>
            <p className="desc" style={{ marginBottom: 22 }}>
              {gpsErrorKind === 'disabled' ? t('locationServicesDisabledMsg') : gpsErrorKind === 'permission' ? t('locationPermissionRequiredMsg') : t('locationUnavailableMsg')}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {gpsErrorKind === 'disabled' && (
                <button type="button" onClick={openDeviceLocationSettings} className="btn btn-primary" style={{ width: '100%' }}>
                  {t('openLocationSettingsBtn')}
                </button>
              )}
              {gpsErrorKind === 'permission' && IS_NATIVE_APP && (
                <button type="button" onClick={openAppSettings} className="btn btn-primary" style={{ width: '100%' }}>
                  {t('openAppSettingsBtn')}
                </button>
              )}
              {gpsErrorKind !== 'disabled' && (
                <button type="button" onClick={captureCustomerLocation} className={gpsErrorKind === 'permission' && IS_NATIVE_APP ? 'btn btn-outline' : 'btn btn-primary'} style={{ width: '100%' }}>
                  {t('tryAgainBtn')}
                </button>
              )}
              {gpsErrorKind === 'disabled' && (
                <button type="button" onClick={captureCustomerLocation} className="btn btn-outline" style={{ width: '100%' }}>
                  {t('tryAgainBtn')}
                </button>
              )}
              <button
                type="button"
                onClick={() => { setGpsError(''); setGpsErrorKind(''); }}
                className="btn btn-ghost" style={{ width: '100%' }}
              >
                {t('btnClose')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showSuccessModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(5,4,3,0.72)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 380, padding: 28, textAlign: 'center' }}>
            <div className="icon-badge jgreen" style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 18px' }}>
              <CheckCircle2 style={{ width: 28, height: 28 }} />
            </div>
            <h3 style={{ marginBottom: 8 }}>{isEditMode ? 'Customer Updated Successfully!' : t('registrationSuccessTitle')}</h3>
            <p className="desc" style={{ marginBottom: 22 }}>{isEditMode ? 'All customer and key compliance details have been updated.' : t('registrationSuccessDesc')}</p>
            <button type="button" onClick={handleSuccessModalOk} className="btn btn-primary" style={{ width: '100%' }}>
              {t('okBtn')}
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

const VEHICLE_CATEGORY_OPTIONS = [
  { value: 'TWO_WHEELER', label: 'Two Wheeler' },
  { value: 'FOUR_WHEELER', label: 'Four Wheeler' },
  { value: 'TRUCK_LORRY', label: 'Truck / Lorry' },
  { value: 'HOME', label: 'Home' },
  { value: 'OFFICE', label: 'Office' },
];

// ============================================================================
// COMPONENT: FULL CUSTOMER EDIT MODAL
// ============================================================================
function FullCustomerEditModal({ t, api, customer, superAdminMode = false, shops = [], onSave, onClose }) {
  const { user } = useAuth();
  const [name, setName] = useState(customer.name || '');
  const [phone, setPhone] = useState(customer.phone || '');
  const [address, setAddress] = useState(customer.address || '');
  const [capturedAddress, setCapturedAddress] = useState(customer.capturedAddress || '');
  const [idProofType, setIdProofType] = useState(customer.idProofType || customer.idType || 'Aadhaar Card');
  const [idProofNumber, setIdProofNumber] = useState(customer.idProofNumber || customer.idNumber || '');
  const [reason, setReason] = useState(customer.reason || '');

  const [vehicleCategory, setVehicleCategory] = useState(customer.vehicleCategory || customer.lockCategory || customer.keyType || 'Two Wheeler');
  const [vehicleName, setVehicleName] = useState(customer.vehicleName || '');
  const [homeOfficeName, setHomeOfficeName] = useState(customer.homeOfficeName || '');
  const [vehicleNumber, setVehicleNumber] = useState(customer.vehicleNumber || '');
  const [keyNumber, setKeyNumber] = useState(customer.keyNumber || customer.keyCode || '');

  const [addKey, setAddKey] = useState(!!customer.addKey);
  const [lostKey, setLostKey] = useState(!!customer.lostKey);
  const [billNumber, setBillNumber] = useState(customer.billNumber || customer.billId || '');
  const [billAmount, setBillAmount] = useState(customer.billAmount != null ? String(customer.billAmount) : '');

  const [latitude, setLatitude] = useState(customer.latitude || null);
  const [longitude, setLongitude] = useState(customer.longitude || null);

  const [selectedShopId, setSelectedShopId] = useState(customer.shopId || customer.shop?.id || '');
  const [stagedPhoto, setStagedPhoto] = useState(null);
  const [stagedDocs, setStagedDocs] = useState([]);
  const [newDocType, setNewDocType] = useState('Aadhaar Card');

  const [isSaving, setIsSaving] = useState(false);

  const isAutomobile = isAutomobileCategory(vehicleCategory);

  const handleStageDocument = (file) => {
    if (!file) return;
    setStagedDocs(prev => [...prev, { type: newDocType, file }]);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updateDto = {
        name,
        phone,
        address,
        capturedAddress: capturedAddress || address,
        idProofType,
        idProofNumber,
        reason,
        vehicleCategory,
        vehicleName: isAutomobile ? vehicleName : null,
        homeOfficeName: !isAutomobile ? homeOfficeName : null,
        vehicleNumber: isAutomobile ? vehicleNumber : null,
        keyNumber,
        addKey,
        lostKey,
        billNumber,
        billAmount: billAmount !== '' ? Number(billAmount) : null,
        latitude,
        longitude,
        ...(superAdminMode && selectedShopId ? { shopId: selectedShopId } : {})
      };

      let updated;
      if (superAdminMode && api.updateSuperCustomer) {
        updated = await api.updateSuperCustomer(customer.id, updateDto);
      } else {
        updated = await api.updateCustomer(customer.id, updateDto);
      }

      if (stagedPhoto) {
        await api.uploadDocument(customer.id, 'Customer Photo', stagedPhoto);
      }

      for (const doc of stagedDocs) {
        await api.uploadDocument(customer.id, doc.type, doc.file);
      }

      let finalCustomer = updated;
      if (superAdminMode && api.getSuperCustomers) {
        try {
          const list = await api.getSuperCustomers(customer.id);
          if (list) finalCustomer = Array.isArray(list) ? list.find(c => c.id === customer.id) || list[0] : list;
        } catch (e) {}
      }

      window.dispatchEvent(new CustomEvent('customer_updated'));
      alert(t('customerComplianceRecordUpdatedMsg') || 'Customer details updated successfully!');
      onSave(finalCustomer || updated);
    } catch (err) {
      console.error('Failed to save customer edits:', err);
      alert(err.message || 'Could not update customer details.');
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-8" style={{ background: 'rgba(5,4,3,0.85)' }}>
      <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 720, margin: 'auto', padding: 28 }}>
        <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 20 }}>
          <div>
            <span className="eyebrow" style={{ marginBottom: 4 }}><Edit /> Edit Customer Registration</span>
            <h2 style={{ fontSize: 20 }}>{customer.name}</h2>
          </div>
          <button onClick={onClose} className="icon-btn"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Section 1: Customer Information */}
          <div className="reg-section">
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--gold)', marginBottom: 14, fontWeight: 800 }}>1. Customer Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="reg-field">
                <div className="reg-field-label"><b>Customer Full Name</b></div>
                <div className="input-wrap"><input type="text" required value={name} onChange={e => setName(e.target.value)} /></div>
              </div>
              <div className="reg-field">
                <div className="reg-field-label"><b>Mobile Phone Number</b></div>
                <div className="input-wrap"><input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} /></div>
              </div>
              <div className="reg-field md:col-span-2">
                <div className="reg-field-label"><b>Customer Address</b></div>
                <div className="input-wrap"><input type="text" value={address} onChange={e => setAddress(e.target.value)} /></div>
              </div>
              <div className="reg-field">
                <div className="reg-field-label"><b>ID Verification Type</b></div>
                <CustomSelect
                  value={idProofType}
                  onChange={setIdProofType}
                  options={ALL_DOC_TYPES.map(dt => ({ value: dt, label: dt }))}
                />
              </div>
              <div className="reg-field">
                <div className="reg-field-label"><b>ID Proof Number</b></div>
                <div className="input-wrap"><input type="text" value={idProofNumber} onChange={e => setIdProofNumber(e.target.value)} /></div>
              </div>
              {superAdminMode && shops && shops.length > 0 && (
                <div className="reg-field md:col-span-2">
                  <div className="reg-field-label"><b>Assigned Key Shop</b></div>
                  <CustomSelect
                    value={selectedShopId}
                    onChange={setSelectedShopId}
                    options={shops.map(s => ({ value: s.id, label: s.name }))}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Key & Vehicle Details */}
          <div className="reg-section">
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--gold)', marginBottom: 14, fontWeight: 800 }}>2. Key & Vehicle Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="reg-field">
                <div className="reg-field-label"><b>Vehicle / Key Category</b></div>
                <CustomSelect
                  value={vehicleCategory}
                  onChange={setVehicleCategory}
                  options={VEHICLE_CATEGORY_OPTIONS}
                />
              </div>
              <div className="reg-field">
                <div className="reg-field-label"><b>Key Blank / Key Code</b></div>
                <div className="input-wrap"><input type="text" value={keyNumber} onChange={e => setKeyNumber(e.target.value)} /></div>
              </div>
              {isAutomobile ? (
                <>
                  <div className="reg-field">
                    <div className="reg-field-label"><b>Vehicle Name / Model</b></div>
                    <div className="input-wrap"><input type="text" value={vehicleName} onChange={e => setVehicleName(e.target.value)} placeholder="e.g. Swift Dzire" /></div>
                  </div>
                  <div className="reg-field">
                    <div className="reg-field-label"><b>Vehicle Number</b></div>
                    <div className="input-wrap"><input type="text" value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} placeholder="e.g. TN01AB1234" /></div>
                  </div>
                </>
              ) : (
                <div className="reg-field md:col-span-2">
                  <div className="reg-field-label"><b>Home / Office Key Description</b></div>
                  <div className="input-wrap"><input type="text" value={homeOfficeName} onChange={e => setHomeOfficeName(e.target.value)} placeholder="e.g. Main Gate Godrej Lock" /></div>
                </div>
              )}
              <div className="reg-field md:col-span-2">
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={addKey} onChange={e => setAddKey(e.target.checked)} className="checkbox" />
                    <span style={{ fontWeight: 700, fontSize: 13 }}>Add Key</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={lostKey} onChange={e => setLostKey(e.target.checked)} className="checkbox" />
                    <span style={{ fontWeight: 700, fontSize: 13 }}>Lost Key</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Billing & Financial Details */}
          <div className="reg-section">
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--gold)', marginBottom: 14, fontWeight: 800 }}>3. Billing & Financial Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="reg-field">
                <div className="reg-field-label"><b>Bill ID / Number</b></div>
                <div className="input-wrap"><input type="text" value={billNumber} onChange={e => setBillNumber(e.target.value)} placeholder="e.g. BILL-2026-1029" /></div>
              </div>
              <div className="reg-field">
                <div className="reg-field-label"><b>Bill Amount (₹)</b></div>
                <div className="input-wrap"><input type="number" step="0.01" value={billAmount} onChange={e => setBillAmount(e.target.value)} placeholder="0.00" /></div>
              </div>
            </div>
          </div>

          {/* Section 4: Customer Snapshot & Documents */}
          <div className="reg-section">
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--gold)', marginBottom: 14, fontWeight: 800 }}>4. Customer Snapshot & Documents</h3>
            <div className="space-y-4">
              {customer.photoUrl && (
                <div className="flex items-center gap-4">
                  <img src={getAssetUrl(customer.photoUrl)} alt="Customer" style={{ width: 60, height: 60, borderRadius: 12, objectFit: 'cover', border: '1px solid var(--border)' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Current Photograph On File</span>
                </div>
              )}

              <div className="reg-field">
                <div className="reg-field-label"><b>Upload Additional Document</b></div>
                <div className="flex items-center gap-3">
                  <CustomSelect
                    value={newDocType}
                    onChange={setNewDocType}
                    options={ALL_DOC_TYPES.map(dt => ({ value: dt, label: dt }))}
                  />
                  <label className="btn btn-outline btn-sm cursor-pointer whitespace-nowrap">
                    <Upload style={{ width: 14, height: 14 }} /> Browse File
                    <input type="file" className="hidden" accept="image/jpeg,image/png,application/pdf" onChange={e => handleStageDocument(e.target.files[0])} />
                  </label>
                </div>
                {stagedDocs.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {stagedDocs.map((sd, sdi) => (
                      <div key={sdi} style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>
                        + Staged document: {sd.type} ({sd.file.name})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3" style={{ borderTop: '1px solid var(--border)', paddingTop: 18 }}>
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={isSaving} className="btn btn-primary">
              {isSaving ? <RefreshCw className="animate-spin h-4 w-4" /> : <Save className="h-4 w-4" />}
              <span>Save Customer Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
// COMPONENT 10: CUSTOMER HISTORY LOOKUP (SHOP ADMIN ONLY)
// ============================================================================
// Page size for the Customer History screen's cursor pagination - see
// CustomerService.getCustomers.
const CUSTOMER_HISTORY_PAGE_SIZE = 20;

// Caches only the first page of the default (no-search) list - module
// scope, same rationale as shopsFirstPageCache above. Keyed by shopId since
// Super Admin can view multiple shops' histories via this same component
// (see CustomerHistoryView's shopId usage below).
let customerHistoryFirstPageCache = null;

function CustomerHistoryView({ t, api, searchDispatch }) {
  const { user } = useAuth();
  const cachedHistoryPage = customerHistoryFirstPageCache && customerHistoryFirstPageCache.shopId === user.shopId
    ? customerHistoryFirstPageCache
    : null;
  const [customers, setCustomers] = useState(cachedHistoryPage ? cachedHistoryPage.items : []);
  const [loading, setLoading] = useState(false);
  // Infinite-scroll pagination state - `customers` only ever holds the pages
  // loaded so far, never this shop's whole compliance history.
  const [nextCursor, setNextCursor] = useState(cachedHistoryPage ? cachedHistoryPage.nextCursor : null);
  const [hasMore, setHasMore] = useState(cachedHistoryPage ? cachedHistoryPage.hasMore : false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef(null);
  const [search, setSearch] = useState('');
  const [town, setTown] = useState('');
  // Debounced before it reaches the server - see PromotionsFeed's identical
  // pattern for why (every change now triggers a network request instead of
  // filtering an already-fully-loaded list).
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);
  const [selectedCust, setSelectedCust] = useState(null);

  // Customer report (Download/WhatsApp buttons on each row) - shop details
  // are fetched once and cached since every report for this Shop Admin's
  // customers uses the same shop info. reportBusyId tracks "<customerId>:
  // <download|share>" so only the button that's mid-generation shows a
  // spinner instead of disabling the whole table.
  const [shopInfo, setShopInfo] = useState(null);
  const [reportBusyId, setReportBusyId] = useState(null);

  const ensureShopInfo = async () => {
    if (shopInfo) return shopInfo;
    const res = await api.getSettings();
    let address = 'N/A';
    let phone = 'N/A';
    if (res.companyDetails) {
      try {
        const details = JSON.parse(res.companyDetails);
        address = details.address || 'N/A';
        phone = details.phone || 'N/A';
      } catch (e) { /* leave defaults */ }
    }
    const info = { name: res.name, address, phone };
    setShopInfo(info);
    return info;
  };

  const handleDownloadCustomerReport = async (c) => {
    setReportBusyId(`${c.id}:download`);
    try {
      const shop = await ensureShopInfo();
      const { buildCustomerReportPdf } = await import('./utils/customerReportPdf');
      const pdf = await buildCustomerReportPdf({ customer: c, shop, registeredByName: user?.name });
      const safeName = `${(c.name || 'Customer').replace(/[^a-zA-Z0-9]+/g, '_')}_Key_Registration_Report.pdf`;
      await downloadPdf(pdf, safeName);
    } catch (err) {
      console.error('Failed to generate customer report PDF:', err);
      window.alert('Could not generate the report PDF. Please try again.');
    } finally {
      setReportBusyId(null);
    }
  };

  const handleShareCustomerReportViaWhatsApp = async (c) => {
    setReportBusyId(`${c.id}:whatsapp`);
    try {
      const shop = await ensureShopInfo();
      const { buildCustomerReportPdf } = await import('./utils/customerReportPdf');
      const pdf = await buildCustomerReportPdf({ customer: c, shop, registeredByName: user?.name });
      const { shareCustomerReportViaWhatsApp } = await import('./utils/reportShare');
      await shareCustomerReportViaWhatsApp({ api, pdf, customer: c });
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        console.error('Failed to share customer report PDF:', err);
        alert('Could not share the report PDF. Please try again.');
      }
    } finally {
      setReportBusyId(null);
    }
  };

  // Picks up a query dispatched from the global header search panel
  // (filter = "Customer").
  useEffect(() => {
    if (searchDispatch && searchDispatch.type === 'customer') {
      setSearch(searchDispatch.query);
    }
  }, [searchDispatch?.nonce]);

  // Edit States
  const [fullEditCust, setFullEditCust] = useState(null);
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

  // Loads the first page for the current search, replacing whatever was
  // loaded before.
  const fetchHistory = async () => {
    // Only blank to a spinner for a real search or a genuinely empty
    // screen - a bare revisit renders the cached first page instantly and
    // refreshes silently in the background.
    if (debouncedSearch || town || customers.length === 0) setLoading(true);
    try {
      const res = await api.getCustomersPage({ search: debouncedSearch, town, limit: CUSTOMER_HISTORY_PAGE_SIZE });
      setCustomers(res.items);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
      if (!debouncedSearch && !town) {
        customerHistoryFirstPageCache = { shopId: user.shopId, items: res.items, nextCursor: res.nextCursor, hasMore: !!res.nextCursor };
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Appends the next page - triggered by the sentinel scrolling into view or
  // the manual "Load More" fallback button.
  const fetchMoreHistory = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.getCustomersPage({ search: debouncedSearch, town, cursor: nextCursor, limit: CUSTOMER_HISTORY_PAGE_SIZE });
      setCustomers((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [debouncedSearch, town]);

  useEffect(() => {
    const node = loadMoreSentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchMoreHistory();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, nextCursor, loadingMore, debouncedSearch, town]);

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

      alert(t('customerComplianceRecordUpdatedMsg'));
      setIsEditing(false);
      setEditUploadFile(null);
      setSelectedCust(null);
      fetchHistory();
    } catch (err) {
      alert(err.message || t('failedSaveCustomerEditsMsg'));
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><FileCheck /> {t('complianceRegistry')}</div>
          <h1>{t('history')}</h1>
          <p>{t('historyPageDesc')}</p>
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
              placeholder={t('searchByNamePhoneKeyCode')}
            />
          </div>
          <CustomSelect
            className="location-filter-select"
            icon={MapPin}
            value={town}
            onChange={setTown}
            placeholder={t('allLocationsLabel')}
            searchable
            searchPlaceholder={t('searchDistrictTownPlaceholder')}
            options={[{ value: '', label: t('allLocationsLabel') }, ...ALL_TN_LOCATIONS.map((loc) => ({ value: loc, label: loc }))]}
            triggerStyle={{ minWidth: 180 }}
          />
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 200 }}>
            <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingComplianceRecordsMsg')}</span>
          </div>
        ) : customers.length === 0 ? (
          <p style={{ padding: 24, fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>
            {t('noComplianceRecordsMatchMsg')}
          </p>
        ) : (
          <table className="kee-table history-table">
            <thead>
              <tr>
                <th>{t('customerCol')}</th>
                <th>{t('phoneCol')}</th>
                <th>{t('vehicleCol')}</th>
                <th>{t('keyCodeCol')}</th>
                <th>{t('locationCol')}</th>
                <th>{t('loggedCol')}</th>
                <th style={{ textAlign: 'right' }}>{t('actionsCol')}</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const rowColors = ['purple', 'blue', 'pink', 'orange', 'teal', 'jgreen', 'skyblue', 'rose', 'maroon'];
                return customers.map((c, idx) => {
                  const rowColor = rowColors[idx % rowColors.length];
                  return (
                    <tr key={c.id} onClick={() => setSelectedCust(c)} style={{ cursor: 'pointer' }}>
                      <td data-label={t('customerCol')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className={`icon-badge ${rowColor}`} style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0 }}>
                            <User style={{ width: 15, height: 15 }} />
                          </div>
                          <div className="cell-primary">{c.name}</div>
                        </div>
                      </td>
                      <td className="cell-sub" data-label={t('phoneCol')} style={{ fontWeight: 700, color: 'var(--text-2)' }}>{c.phone}</td>
                      <td className="cell-sub" data-label={t('vehicleCol')} style={{ fontWeight: 700, color: 'var(--text-2)' }}>{c.vehicleNumber || 'N/A'}</td>
                      <td data-label={t('keyCodeCol')}>
                        <span className="badge badge-active"><span className="dot" />{c.keyNumber}</span>
                        {c.keyType && <div className="cell-sub" style={{ marginTop: 4 }}>{c.keyType}</div>}
                      </td>
                      <td className="cell-sub" data-label={t('locationCol')} style={{ fontWeight: 700, color: 'var(--text-2)' }}>
                        <span className="flex items-start gap-1" style={{ wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.3, maxWidth: 220 }}>
                          <MapPin style={{ width: 13, height: 13, color: 'var(--green)', flexShrink: 0, marginTop: 2 }} />
                          <span>{c.capturedAddress || c.address || 'N/A'}</span>
                        </span>
                      </td>
                      <td className="cell-sub" data-label={t('loggedCol')} style={{ fontWeight: 700, color: 'var(--text-2)' }}>{new Date(c.createdAt).toLocaleDateString()}</td>
                      <td data-label={t('actionsCol')}>
                        <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                          <button onClick={(e) => { e.stopPropagation(); setSelectedCust(c); }} className="icon-btn" title={t('viewComplianceFile')}>
                            <Eye />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownloadCustomerReport(c); }}
                            disabled={reportBusyId === `${c.id}:download`}
                            className="icon-btn" title={t('downloadReportBtn')}
                          >
                            {reportBusyId === `${c.id}:download` ? <RefreshCw className="animate-spin h-4 w-4" /> : <Download className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleShareCustomerReportViaWhatsApp(c); }}
                            disabled={reportBusyId === `${c.id}:whatsapp`}
                            className="icon-btn" title={t('shareViaWhatsAppBtn')}
                          >
                            {reportBusyId === `${c.id}:whatsapp` ? <RefreshCw className="animate-spin h-4 w-4" /> : (
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /><path d="M12.004 2C6.486 2 2 6.486 2 12.004c0 1.85.505 3.649 1.462 5.207L2 22l4.933-1.437a9.96 9.96 0 0 0 5.071 1.39h.004c5.518 0 10.004-4.486 10.004-10.005C22.012 6.486 17.522 2 12.004 2zm0 18.155h-.003a8.14 8.14 0 0 1-4.153-1.14l-.298-.177-3.09.9.918-3.02-.194-.309a8.13 8.13 0 0 1-1.257-4.405c0-4.494 3.657-8.15 8.156-8.15 2.178 0 4.225.85 5.766 2.393a8.096 8.096 0 0 1 2.386 5.762c-.002 4.494-3.658 8.15-8.156 8.15z" /></svg>
                            )}
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

        {/* Infinite scroll (sentinel) + manual "Load More" fallback - see
            PromotionsFeed's identical pattern for why both exist. */}
        {!loading && hasMore && (
          <div ref={loadMoreSentinelRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 20 }}>
            {loadingMore ? (
              <RefreshCw className="animate-spin" style={{ width: 20, height: 20, color: 'var(--gold)' }} />
            ) : (
              <button type="button" onClick={fetchMoreHistory} className="btn btn-outline btn-sm">
                {t('loadMoreBtn')}
              </button>
            )}
          </div>
        )}
      </div>

      {selectedCust && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4 md:p-10" style={{ background: 'rgba(5,4,3,0.82)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 640, margin: 'auto', padding: 28 }}>
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><FileCheck /> {t('complianceFileEyebrow')}</span>
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
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Phone /></div><b>{t('phoneContactLabel')}</b></div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{selectedCust.phone || 'N/A'}</span>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Calendar /></div><b>{t('registryDateLabel')}</b></div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{new Date(selectedCust.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><Home /></div><b>{t('addressLabel')}</b></div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }} className="block truncate">{selectedCust.address || selectedCust.capturedAddress || 'N/A'}</span>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><KeyRound /></div><b>{t('keyBlankCodeLabel')}</b></div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="badge badge-active"><span className="dot" />{selectedCust.keyNumber || selectedCust.keyCode || 'N/A'}</span>
                      </div>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Car /></div><b>Vehicle / Key Type</b></div>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gold)' }}>{selectedCust.vehicleCategory || selectedCust.lockCategory || selectedCust.keyType || 'N/A'}</span>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Tag /></div><b>Key / Vehicle Name</b></div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{selectedCust.vehicleName || selectedCust.homeOfficeName || 'N/A'}</span>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><CheckCircle2 /></div><b>Add Key / Lost Key</b></div>
                      <div className="flex items-center gap-2">
                        <span className={`badge ${selectedCust.addKey ? 'badge-active' : 'badge-suspended'}`}>Add: {selectedCust.addKey ? 'Yes' : 'No'}</span>
                        <span className={`badge ${selectedCust.lostKey ? 'badge-active' : 'badge-suspended'}`}>Lost: {selectedCust.lostKey ? 'Yes' : 'No'}</span>
                      </div>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--gold)' }}><DollarSign /></div><b>Bill ID & Amount</b></div>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--gold)' }}>
                        {selectedCust.billNumber || selectedCust.billId || 'N/A'} {selectedCust.billAmount != null && selectedCust.billAmount !== '' ? `(₹${Number(selectedCust.billAmount).toFixed(2)})` : '(N/A)'}
                      </span>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Fingerprint /></div><b>{t('idVerificationLabel')}</b></div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{selectedCust.idProofType || selectedCust.idType || 'N/A'}</span>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><Lock /></div><b>{t('idNumberDecryptedLabel')}</b></div>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gold)' }}>{selectedCust.idProofNumber || selectedCust.idNumber || 'N/A'}</span>
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
                          <p style={{ fontWeight: 700, color: 'var(--text-0)', fontSize: 13 }}>{t('gpsCoordinatesLabel')}</p>
                          {selectedCust.latitude && selectedCust.longitude ? (
                            <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, fontWeight: 600 }}>{t('latLongTemplate').split('{lat}')[0]}{selectedCust.latitude}{t('latLongTemplate').split('{lat}')[1].split('{long}')[0]}{selectedCust.longitude}</p>
                          ) : (
                            <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, fontWeight: 600, fontStyle: 'italic' }}>{t('notCapturedLabel')}</p>
                          )}
                        </div>
                      </div>
                      {selectedCust.mapsLink && (
                        <a href={selectedCust.mapsLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10.5, color: 'var(--gold)', fontWeight: 800 }} className="flex items-center gap-1 hover:underline">
                          <span>{t('googleMapsLabel')}</span><ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {selectedCust.capturedAddress && (
                      <div style={{ fontSize: 10.5, color: 'var(--text-2)', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8, paddingLeft: 42, fontWeight: 600 }}>
                        <span style={{ display: 'block', fontWeight: 800, fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase' }}>{t('capturedAddressLabel')}</span>
                        <span>{selectedCust.capturedAddress}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="reg-section" style={{ marginBottom: 0 }}>
                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Camera /></div><b>{t('webcamPhotoLabel')}</b></div>
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
                    <div className="reg-field space-y-2" style={{ marginBottom: 0, minWidth: 0 }}>
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><FileCheck /></div><b>{t('attachedIdCopiesLabel')}</b></div>
                      {selectedCust.documents.map((d, di) => {
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
                              {uploaded ? t('uploadedBadge') : t('missingBadge')}
                            </span>
                            <button
                              type="button"
                              title={t('downloadTitleLabel')}
                              aria-label={t('downloadTitleLabel')}
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

                <div className="flex justify-between items-center flex-wrap gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadCustomerReport(selectedCust)}
                      disabled={reportBusyId === `${selectedCust.id}:download`}
                      className="btn btn-outline btn-sm"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download Document</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShareCustomerReportViaWhatsApp(selectedCust)}
                      disabled={reportBusyId === `${selectedCust.id}:whatsapp`}
                      className="btn btn-primary btn-sm"
                      style={{ background: '#25D366', borderColor: '#25D366' }}
                    >
                      <MessageCircle className="h-4 w-4" />
                      <span>WhatsApp</span>
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setFullEditCust(selectedCust)} className="btn btn-primary btn-sm">
                      <Edit /> <span>{t('editDetailsBtn')}</span>
                    </button>
                    <button onClick={() => setSelectedCust(null)} className="btn btn-ghost btn-sm">{t('closeFileBtn')}</button>
                  </div>
                </div>
              </>
            ) : (
              <form onSubmit={handleSaveChanges}>
                <div className="reg-section">
                  <div className="form-grid">
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><User /></div><b>{t('fullCustomerNameLabel')}</b></div>
                      <div className="input-wrap">
                        <input type="text" required value={editName} onChange={(e) => setEditName(e.target.value)} />
                      </div>
                    </div>
                    <div className="reg-field" style={{ marginBottom: 0 }}>
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Phone /></div><b>{t('phoneNumberLabel')}</b></div>
                      <div className="input-wrap">
                        <input type="tel" required value={editPhoneVal} onChange={(e) => setEditPhoneVal(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="reg-section">
                  <div className="form-grid">
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Car /></div><b>{t('vehicleNumberLabel')}</b></div>
                      <div className="input-wrap">
                        <input type="text" required value={editVehicleNumber} onChange={(e) => setEditVehicleNumber(e.target.value.toUpperCase())} />
                      </div>
                    </div>
                    <div className="reg-field" style={{ marginBottom: 0 }}>
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><KeyRound /></div><b>{t('keyBlankCodeLabel')}</b></div>
                      <div className="input-wrap">
                        <input type="text" required value={editKeyNumber} onChange={(e) => setEditKeyNumber(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="reg-section">

                  <div className="reg-field">
                    <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><MapPin /></div><b>{t('addressLineLabel')}</b></div>
                    <div className="input-wrap">
                      <input type="text" required value={editAddressLine} onChange={(e) => setEditAddressLine(e.target.value)} />
                    </div>
                  </div>

                  <div className="form-grid">
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Navigation /></div><b>{t('districtLabel')}</b></div>
                      <div className="input-wrap">
                        <input type="text" required value={editDistrict} onChange={(e) => setEditDistrict(e.target.value)} />
                      </div>
                    </div>
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><Navigation /></div><b>{t('stateLabel')}</b></div>
                      <div className="input-wrap">
                        <input type="text" required value={editStateVal} onChange={(e) => setEditStateVal(e.target.value)} />
                      </div>
                    </div>
                    <div className="reg-field full" style={{ marginBottom: 0 }}>
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Navigation /></div><b>{t('countryLabel')}</b></div>
                      <div className="input-wrap">
                        <input type="text" readOnly value="India" style={{ opacity: .55, cursor: 'not-allowed' }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="reg-section" style={{ marginBottom: 0 }}>
                  <div className="form-grid">
                    <div className="reg-field">
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><ShieldCheck /></div><b>{t('documentIdTypeLabel')}</b></div>
                      <CustomSelect
                        value={editIdProofType} onChange={setEditIdProofType}
                        options={[
                          { value: 'Aadhaar Card', label: t('aadhaarCardLabel'), disabled: selectedCust?.documents?.some(d => d.documentType === 'Aadhaar Card' || d.documentType === 'Aadhaar Card Copy') },
                          { value: 'Driving License', label: t('drivingLicenseLabel'), disabled: selectedCust?.documents?.some(d => d.documentType === 'Driving License' || d.documentType === 'Driving License Copy') },
                          { value: 'PAN Card', label: t('panCardLabel'), disabled: selectedCust?.documents?.some(d => d.documentType === 'PAN Card' || d.documentType === 'PAN Card Copy') },
                          { value: 'Voter ID', label: t('voterIdLabel'), disabled: selectedCust?.documents?.some(d => d.documentType === 'Voter ID' || d.documentType === 'Voter ID Copy') },
                        ]}
                      />
                    </div>
                    <div className="reg-field" style={{ marginBottom: 0 }}>
                      <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><UploadCloud /></div><b>{t('uploadNewFileCopyLabel')}</b></div>
                      <div className="dropzone" style={{ padding: '16px 12px', position: 'relative' }}>
                        <UploadCloud style={{ width: 20, height: 20, color: 'var(--gold)' }} />
                        <span className="dz-sub">{editUploadFile ? editUploadFile.name : t('jpegPngPdfLabel')}</span>
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
                    {t('btnCancel')}
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {t('saveChangesBtn')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}

      {fullEditCust && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'var(--bg-0, #0b0a09)' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px 60px' }}>
            <CustomerRegistrationWizard
              t={t}
              api={api}
              editCustomer={fullEditCust}
              onCancel={() => setFullEditCust(null)}
              onDone={(updated) => {
                setFullEditCust(null);
                if (selectedCust && updated) setSelectedCust(updated);
                fetchHistory();
              }}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// In-memory cache (module scope, platform-wide singleton config, no
// user-scoping needed) - shared by both CustomerCareView and
// SupportContactView below, which read the exact same config for two
// different read-only displays. Not used by SupportConfigView's own
// fetchConfig (the Super Admin's editable form) - showing stale cached
// values there and having them silently jump mid-edit would be worse than
// a brief spinner on a screen that's visited rarely to begin with.
let supportConfigCache = null;

// ============================================================================
// COMPONENT 11.5: CUSTOMER CARE VIEW (SUPPORT & SKILLS TRAINING)
// ============================================================================
export function CustomerCareView({ t, api }) {
  const [config, setConfig] = useState(supportConfigCache);
  const [loading, setLoading] = useState(!supportConfigCache);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await api.getSupportConfig();
      setConfig(res);
      supportConfigCache = res;
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
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingSupportResourcesMsg')}</span>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Phone /> {t('customerCare')}</div>
          <h1>{t('supportTrainingCenterTitle')}</h1>
          <p>{t('reachSupportTrainingDesc')}</p>
        </div>
      </div>

      <div className="card">
        <div className="section-title" style={{ marginBottom: 14 }}>
          <div className="flex items-center gap-3">
            <div className="icon-badge teal" style={{ width: 34, height: 34, borderRadius: 10 }}>
              <Radio style={{ width: 16, height: 16 }} />
            </div>
            <div>
              <h2 style={{ fontSize: 16 }}>{t('locksmithSkillUpgradesTitle')}</h2>
              <span className="sub">{t('videoTutorialsFromExpertsDesc')}</span>
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
                    <span style={{ fontSize: 9, color: 'var(--gold)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '.05em' }}>{t('trainingMaterialLabel')}</span>
                    <h4 className="pname" style={{ fontSize: 12.5 }}>{vid.name}</h4>
                    <a href={vid.url} target="_blank" rel="noreferrer" style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600 }} className="hover:underline truncate block">{t('watchLinkLabel')}</a>
                  </div>
                </div>
              );
            })
          ) : (
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, fontStyle: 'italic', gridColumn: '1 / -1', padding: '32px 0', textAlign: 'center' }}>
              {t('noSkillUpgradeVideosMsg')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENT 11.55: SUPPORT CONTACT VIEW (SHOP ADMIN - OWNER CONTACT DETAILS)
// ============================================================================
// Reached via the mobile bottom-nav "Customer Service" icon for Shop Admins.
// Shows the Super-Admin-managed support contact details (customer care
// number, WhatsApp, email) - distinct from CustomerCareView above, which
// only shows training videos.
export function SupportContactView({ t, api }) {
  const [config, setConfig] = useState(supportConfigCache);
  const [loading, setLoading] = useState(!supportConfigCache);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getSupportConfig();
        setConfig(res);
        supportConfigCache = res;
      } catch (e) {
        console.error('Failed to load support config:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
        <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingSupportResourcesMsg')}</span>
      </div>
    );
  }

  const hasContactInfo = !!(config?.customerCareNumber || config?.whatsapp || config?.email);
  // Plain tel:/https:wa.me/mailto: links - Capacitor's default WebViewClient
  // hands non-http(s) schemes off to a system ACTION_VIEW intent (dialer,
  // WhatsApp) inside the native app, and the browser does the equivalent on
  // web, so no extra native plugin/JS is needed (same pattern already used
  // for dealer phone/WhatsApp buttons elsewhere in this file).
  const rows = [
    { icon: Phone, color: 'maroon', label: t('customerCareNumberLabel'), value: config?.customerCareNumber, href: config?.customerCareNumber ? `tel:${config.customerCareNumber}` : null },
    { icon: MessageCircle, color: 'jgreen', label: t('whatsappNumberLabel'), value: config?.whatsapp, href: config?.whatsapp ? `https://wa.me/${config.whatsapp.replace(/[^0-9]/g, '')}` : null, external: true },
    { icon: Mail, color: 'purple', label: t('emailAddressLabel'), value: config?.email, href: config?.email ? `mailto:${config.email}` : null },
  ].filter(r => r.value);

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Headset /> {t('supportContactEyebrow')}</div>
          <h1>{t('supportContactTitle')}</h1>
          <p>{t('supportContactDesc')}</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 520 }}>
        {hasContactInfo ? (
          <div className="space-y-3">
            {rows.map((r, idx) => (
              <a
                key={idx}
                href={r.href}
                {...(r.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="loc-box"
                style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
              >
                <div className="loc-info">
                  <div className={`icon-badge ${r.color}`}><r.icon /></div>
                  <div className="loc-text">
                    <span className="t1" style={{ display: 'block' }}>{r.value}</span>
                    <span className="t2">{r.label}</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              </a>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, fontStyle: 'italic', padding: '32px 0', textAlign: 'center' }}>
            {t('noContactInfoConfiguredMsg')}
          </p>
        )}
      </div>

      <CompanyDetailsCard t={t} />
    </div>
  );
}

// Static company information shown on the Customer Service / Contact
// screens (both authenticated Shop Admin and pre-login public app) - no
// backend config for this, it's fixed business identity text. Split into
// two labeled lines (Company / Address) with the brand logo alongside,
// matching the reference layout the user provided.
export function CompanyDetailsCard({ t }) {
  return (
    <div className="card" style={{ maxWidth: 520, marginTop: 16 }}>
      <div className="section-title" style={{ marginBottom: 14 }}>
        <div className="flex items-center gap-3">
          <div className="icon-badge blue" style={{ width: 34, height: 34, borderRadius: 10 }}>
            <Building2 style={{ width: 16, height: 16 }} />
          </div>
          <div>
            <h2 style={{ fontSize: 15 }}>{t('companyDetailsTitle')}</h2>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{t('companyLabel')}</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, lineHeight: 1.5, margin: 0 }}>{t('companySentence')}</p>
          </div>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{t('addressLabel')}</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, lineHeight: 1.5, margin: 0 }}>{t('addressSentence')}</p>
          </div>
        </div>
        <img src={keyShopLogo} alt="Key Shops" style={{ width: 120, height: 120, objectFit: 'contain', flexShrink: 0 }} />
      </div>
    </div>
  );
}

// Generic static-content screen (Terms & Conditions, About Us) - reused by
// both the authenticated Shop Admin drawer and the pre-login public app's
// hamburger drawer (see PublicMobileApp.jsx's PublicStaticInfoScreen, which
// mirrors this same title/body content rather than importing this component
// directly, since it renders inside a different page shell/back-button model).
export function StaticInfoView({ icon: Icon, eyebrow, title, body }) {
  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Icon /> {eyebrow}</div>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="card" style={{ maxWidth: 640 }}>
        <p style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
          {body}
        </p>
      </div>
    </div>
  );
}

// Feedback & Suggestions - no dedicated backend endpoint for this, so it
// routes into the same support email/WhatsApp already configured for
// Customer Service rather than a form that would go nowhere.
export function FeedbackView({ t, api }) {
  const [config, setConfig] = useState(supportConfigCache);

  useEffect(() => {
    api.getSupportConfig().then((res) => { setConfig(res); supportConfigCache = res; }).catch(() => {});
  }, []);

  const subject = encodeURIComponent('Key Shops - Feedback & Suggestions');
  const mailHref = config?.email ? `mailto:${config.email}?subject=${subject}` : null;
  const waHref = config?.whatsapp ? `https://wa.me/${config.whatsapp.replace(/[^0-9]/g, '')}?text=${subject}` : null;

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><MessageCircle /> {t('feedbackTitle')}</div>
          <h1>{t('feedbackTitle')}</h1>
        </div>
      </div>
      <div className="card" style={{ maxWidth: 520 }}>
        <p style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600, lineHeight: 1.7, marginBottom: 18 }}>
          {t('feedbackBody')}
        </p>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          {mailHref && (
            <a href={mailHref} className="btn btn-primary btn-sm">
              <Mail className="h-4 w-4" /> {t('sendFeedbackBtn')}
            </a>
          )}
          {waHref && (
            <a href={waHref} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          )}
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
  const [email, setEmail] = useState('');
  const [customerCareNumber, setCustomerCareNumber] = useState('');
  const [videos, setVideos] = useState([]);
  const [subscriptionPrice, setSubscriptionPrice] = useState(999);
  const [gstPercent, setGstPercent] = useState(18);
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
  // Drag-and-drop reordering (native HTML5 DnD - this screen is Super
  // Admin-only and used from the web console, so no touch-drag polyfill is
  // needed). `draggedId` tracks which row is mid-drag; `savingOrder` blocks
  // further drags while the reorder request is in flight.
  const [draggedCatId, setDraggedCatId] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);
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
      setEmail(res.email || '');
      setCustomerCareNumber(res.customerCareNumber || '');
      setVideos(res.videos || []);
      setSubscriptionPrice(res.subscriptionPrice ?? 999);
      setGstPercent(res.gstPercent ?? 18);
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
      await api.updateSupportConfig({ whatsapp, videos, email, customerCareNumber, subscriptionPrice: Number(subscriptionPrice), gstPercent: Number(gstPercent) });
      alert(t('supportConfigUpdatedMsg'));
    } catch (e) {
      alert(t('saveFailedTemplate').split('{msg}')[0] + e.message);
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
      alert(t('pleaseEnterCategoryNameMsg'));
      return;
    }
    setAddingCategory(true);
    try {
      await api.createShopCategory(name);
      setNewCategoryName('');
      await fetchCategories();
    } catch (e) {
      alert(t('failedAddCategoryTemplate').split('{msg}')[0] + e.message);
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
      alert(t('pleaseEnterCategoryNameMsg'));
      return;
    }
    setSavingCatId(id);
    try {
      await api.updateShopCategory(id, name);
      setEditingCatId(null);
      await fetchCategories();
    } catch (e) {
      alert(t('failedUpdateCategoryTemplate').split('{msg}')[0] + e.message);
    } finally {
      setSavingCatId(null);
    }
  };

  const handleDeleteCategory = async (cat) => {
    const [confirmPre, confirmPost] = t('deleteCategoryConfirmTemplate').split('{name}');
    if (!confirm(confirmPre + cat.name + confirmPost)) return;
    setSavingCatId(cat.id);
    try {
      await api.deleteShopCategory(cat.id);
      await fetchCategories();
    } catch (e) {
      alert(t('failedDeleteCategoryTemplate').split('{msg}')[0] + e.message);
    } finally {
      setSavingCatId(null);
    }
  };

  // Drag-and-drop reordering for the Shop Categories list - this is the
  // order shown in the public self-registration wizard's Category dropdown
  // (see ShopCategoryService.getAllCategories), so dragging here directly
  // controls what shop owners see. Reorders the local list immediately for
  // a responsive drag, then persists it; on failure, re-fetches the real
  // order from the server instead of leaving the UI showing a state that
  // was never actually saved.
  const handleCategoryDragStart = (catId) => {
    if (editingCatId || savingOrder) return;
    setDraggedCatId(catId);
  };

  const handleCategoryDragOver = (e, overCatId) => {
    e.preventDefault();
    if (!draggedCatId || draggedCatId === overCatId) return;
    setCategories((prev) => {
      const fromIndex = prev.findIndex((c) => c.id === draggedCatId);
      const toIndex = prev.findIndex((c) => c.id === overCatId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const handleCategoryDrop = async () => {
    const orderedIds = categories.map((c) => c.id);
    setDraggedCatId(null);
    setSavingOrder(true);
    try {
      await api.reorderShopCategories(orderedIds);
    } catch (e) {
      alert(t('failedReorderCategoriesTemplate').split('{msg}')[0] + e.message);
      await fetchCategories();
    } finally {
      setSavingOrder(false);
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
      alert(t('pleaseEnterProductTypeNameMsg'));
      return;
    }
    setAddingProductType(true);
    try {
      await api.createProductType(name);
      setNewProductTypeName('');
      await fetchProductTypes();
    } catch (e) {
      alert(t('failedAddProductTypeTemplate').split('{msg}')[0] + e.message);
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
      alert(t('pleaseEnterProductTypeNameMsg'));
      return;
    }
    setSavingPtId(id);
    try {
      await api.updateProductType(id, name);
      setEditingPtId(null);
      await fetchProductTypes();
    } catch (e) {
      alert(t('failedUpdateProductTypeTemplate').split('{msg}')[0] + e.message);
    } finally {
      setSavingPtId(null);
    }
  };

  const handleDeleteProductType = async (pt) => {
    const [confirmPre, confirmPost] = t('deleteProductTypeConfirmTemplate').split('{name}');
    if (!confirm(confirmPre + pt.name + confirmPost)) return;
    setSavingPtId(pt.id);
    try {
      await api.deleteProductType(pt.id);
      await fetchProductTypes();
    } catch (e) {
      alert(t('failedDeleteProductTypeTemplate').split('{msg}')[0] + e.message);
    } finally {
      setSavingPtId(null);
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
        <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingSupportConfigMsg')}</span>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><LifeBuoy /> {t('platformSupportEyebrow')}</div>
          <h1>{t('customerSupportConfigTitle')}</h1>
          <p>{t('configureGlobalSupportDesc')}</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        <form onSubmit={handleSave}>
          <div className="reg-section">
            <div className="reg-field" style={{ marginBottom: 0 }}>
              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--jgreen)' }}><MessageCircle /></div><b>{t('customerSupportWhatsappLabel')} <span className="req">*</span></b></div>
              <div className="input-wrap">
                <input
                  type="text" required value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder={t('whatsappNumberPlaceholderEg')}
                />
              </div>
            </div>
          </div>

          <div className="reg-section">
            <div className="reg-field">
              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--gold)' }}><IndianRupee /></div><b>{t('subscriptionPriceLabel')} <span className="req">*</span></b></div>
              <div className="input-wrap">
                <input
                  type="number" required min="0" step="0.01" value={subscriptionPrice}
                  onChange={(e) => setSubscriptionPrice(e.target.value)}
                  placeholder={t('subscriptionPricePlaceholderEg')}
                />
              </div>
              <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>{t('subscriptionPriceHint')}</span>
            </div>
            <div className="reg-field" style={{ marginBottom: 0 }}>
              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--orange)' }}><Percent /></div><b>{t('gstPercentLabel')} <span className="req">*</span></b></div>
              <div className="input-wrap">
                <input
                  type="number" required min="0" max="100" step="0.01" value={gstPercent}
                  onChange={(e) => setGstPercent(e.target.value)}
                  placeholder="18"
                />
              </div>
              <span className="cell-sub" style={{ display: 'block', marginTop: 6 }}>{t('gstPercentHint')}</span>
            </div>
          </div>

          <div className="reg-section">
            <div className="reg-section-head">
              <div className="reg-ico" style={{ background: 'var(--purple)' }}><User /></div>
              <h3>{t('ownerContactSectionTitle')}</h3>
              <span className="sub" style={{ marginLeft: 'auto' }}>{t('ownerContactSectionDesc')}</span>
            </div>
            <div className="reg-field">
              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Mail /></div><b>{t('emailAddressLabel')}</b></div>
              <div className="input-wrap">
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('supportConfigEmailPlaceholderEg')}
                />
              </div>
            </div>
            <div className="reg-field" style={{ marginBottom: 0 }}>
              <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><Phone /></div><b>{t('customerCareNumberLabel')}</b></div>
              <div className="input-wrap">
                <input
                  type="text" value={customerCareNumber} onChange={(e) => setCustomerCareNumber(e.target.value)}
                  placeholder={t('customerCareNumberPlaceholderEg')}
                />
              </div>
            </div>
          </div>

          <div className="reg-section" style={{ marginBottom: 0 }}>
            <div className="reg-section-head" style={{ justifyContent: 'flex-end' }}>
              <span className="sub" style={{ marginRight: 10 }}>{videos.length} {videos.length === 1 ? t('videoSingularLabel') : t('videoPluralLabel')}</span>
              <button
                type="button"
                onClick={() => setVideos([...videos, { name: '', url: '' }])}
                className="btn btn-outline btn-sm"
              >
                <Plus /> {t('addVideoBtn')}
              </button>
            </div>

            {videos.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, fontStyle: 'italic' }}>
                {t('noVideosConfiguredMsg')}
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
                        title={t('removeVideoTitle')}
                      >
                        <X />
                      </button>
                      <div className="form-grid" style={{ paddingRight: 36 }}>
                        <div className="reg-field" style={{ marginBottom: 0 }}>
                          <div className="reg-field-label"><div className="reg-ico" style={{ background: `var(--${rowColor})` }}><PlayCircle /></div><b>{t('videoTitleNameLabel')}</b></div>
                          <div className="input-wrap">
                            <input
                              type="text" required value={vid.name}
                              onChange={(e) => {
                                const newVids = [...videos];
                                newVids[idx].name = e.target.value;
                                setVideos(newVids);
                              }}
                              placeholder={t('videoTitlePlaceholderEg')}
                            />
                          </div>
                        </div>
                        <div className="reg-field" style={{ marginBottom: 0 }}>
                          <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><ExternalLink /></div><b>{t('youtubeUrlLabel')}</b></div>
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
              <span>{t('saveConfigurationBtn')}</span>
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ maxWidth: 720, marginTop: 20 }}>
        <div className="reg-section" style={{ marginBottom: 0 }}>
          <div className="reg-section-head">
            <div className="reg-ico" style={{ background: 'var(--purple)' }}><Tag /></div>
            <h3>{t('shopCategoriesTitle')}</h3>
            <span className="sub" style={{ marginLeft: 'auto' }}>{categories.length} {categories.length === 1 ? t('categorySingularLabel') : t('categoryPluralLabel')}</span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, marginBottom: 14 }}>
            {t('manageShopCategoriesDesc')}
          </p>

          <div className="reg-field" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="input-wrap" style={{ flex: 1 }}>
                <input
                  type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder={t('enterCategoryNamePlaceholder')}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }}
                />
              </div>
              <button type="button" onClick={handleAddCategory} disabled={addingCategory} className="btn btn-outline btn-sm">
                {addingCategory ? <RefreshCw className="animate-spin" /> : <Plus />} {t('addBtnLabel')}
              </button>
            </div>
          </div>

          {catLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
              <RefreshCw className="animate-spin" style={{ width: 22, height: 22, color: 'var(--gold)' }} />
            </div>
          ) : categories.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, fontStyle: 'italic' }}>
              {t('noCategoriesYetMsg')}
            </p>
          ) : (
            <div className="space-y-3" style={{ maxHeight: 340, overflowY: 'auto', paddingRight: 4 }}>
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  draggable={!editingCatId && !savingOrder}
                  onDragStart={() => handleCategoryDragStart(cat.id)}
                  onDragOver={(e) => handleCategoryDragOver(e, cat.id)}
                  onDrop={handleCategoryDrop}
                  onDragEnd={() => setDraggedCatId(null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card-2)',
                    border: '1px solid var(--border-2)', borderRadius: 12, padding: '10px 14px', marginBottom: 8,
                    opacity: draggedCatId === cat.id ? 0.4 : 1,
                    cursor: !editingCatId && !savingOrder ? 'grab' : 'default',
                  }}
                >
                  {editingCatId === cat.id ? (
                    <>
                      <input
                        type="text" value={editingCatName} onChange={(e) => setEditingCatName(e.target.value)}
                        style={{ flex: 1 }} autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveEditCategory(cat.id); } }}
                      />
                      <button type="button" onClick={() => handleSaveEditCategory(cat.id)} disabled={savingCatId === cat.id} className="icon-btn" title={t('btnSave')} style={{ color: 'var(--jgreen)' }}>
                        {savingCatId === cat.id ? <RefreshCw className="animate-spin h-4 w-4" /> : <Check className="h-4 w-4" />}
                      </button>
                      <button type="button" onClick={() => setEditingCatId(null)} className="icon-btn" title={t('btnCancel')}>
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <GripVertical style={{ width: 16, height: 16, color: 'var(--text-3)', flexShrink: 0 }} />
                      <Tag style={{ width: 16, height: 16, color: 'var(--text-3)', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{cat.name}</span>
                      <button type="button" onClick={() => handleStartEditCategory(cat)} className="icon-btn" title={t('btnEdit')}>
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        type="button" onClick={() => handleDeleteCategory(cat)} disabled={savingCatId === cat.id}
                        className="icon-btn" style={{ color: 'var(--red)' }} title={t('btnDelete')}
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
          <div className="reg-section-head">
            <div className="reg-ico" style={{ background: 'var(--blue)' }}><Layers /></div>
            <h3>{t('productTypesTitle')}</h3>
            <span className="sub" style={{ marginLeft: 'auto' }}>{productTypes.length} {productTypes.length === 1 ? t('typeSingularLabel') : t('typePluralLabel')}</span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, marginBottom: 14 }}>
            {t('manageProductTypesDesc')}
          </p>

          <div className="reg-field" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="input-wrap" style={{ flex: 1 }}>
                <input
                  type="text" value={newProductTypeName} onChange={(e) => setNewProductTypeName(e.target.value)}
                  placeholder={t('enterProductTypePlaceholder')}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddProductType(); } }}
                />
              </div>
              <button type="button" onClick={handleAddProductType} disabled={addingProductType} className="btn btn-outline btn-sm">
                {addingProductType ? <RefreshCw className="animate-spin" /> : <Plus />} {t('addBtnLabel')}
              </button>
            </div>
          </div>

          {ptLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
              <RefreshCw className="animate-spin" style={{ width: 22, height: 22, color: 'var(--gold)' }} />
            </div>
          ) : productTypes.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, fontStyle: 'italic' }}>
              {t('noProductTypesYetMsg')}
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
                      <button type="button" onClick={() => handleSaveEditProductType(pt.id)} disabled={savingPtId === pt.id} className="icon-btn" title={t('btnSave')} style={{ color: 'var(--jgreen)' }}>
                        {savingPtId === pt.id ? <RefreshCw className="animate-spin h-4 w-4" /> : <Check className="h-4 w-4" />}
                      </button>
                      <button type="button" onClick={() => setEditingPtId(null)} className="icon-btn" title={t('btnCancel')}>
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <Layers style={{ width: 16, height: 16, color: 'var(--text-3)', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{pt.name}</span>
                      <button type="button" onClick={() => handleStartEditProductType(pt)} className="icon-btn" title={t('btnEdit')}>
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        type="button" onClick={() => handleDeleteProductType(pt)} disabled={savingPtId === pt.id}
                        className="icon-btn" style={{ color: 'var(--red)' }} title={t('btnDelete')}
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

// In-memory cache (module scope, keyed by shopId since Super Admin can open
// this for different shops) for the read-only Referral & Rewards overview
// section - unlike the rest of this screen (an editable settings form,
// deliberately left uncached so a revisit never shows stale values mid-edit),
// this is a passive display, safe to render instantly from cache while
// refreshing silently.
const referralOverviewCache = {};

// shopId is only passed when the Super Admin is managing a specific shop's
// settings from Shops Management (see ShopsManagementView's "Manage Settings"
// button) - a normal Shop Admin visiting their own Settings tab omits it and
// the backend falls back to req.user.shopId.
function ShopSettingsView({ t, api, shopId }) {
  const { user } = useAuth();
  const referralCacheKey = shopId || 'own';
  const cachedReferral = referralOverviewCache[referralCacheKey] || null;
  const [shopName, setShopName] = useState('');
  const [address, setAddress] = useState('');
  const [gst, setGst] = useState('');
  const [phone, setPhone] = useState('');
  const [verificationDoc, setVerificationDoc] = useState(null);
  const [docUploading, setDocUploading] = useState(false);
  // Shop's own logo, shown on its public Shop Details page (see
  // ShopService.uploadLogo) - a single always-current image, not a
  // versioned document like verificationDoc above, so there's no separate
  // "remove" flow: uploading again just replaces it.
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settingsError, setSettingsError] = useState('');
  const [referralCode, setReferralCode] = useState(cachedReferral ? cachedReferral.referralCode : null);
  const [referralGenerating, setReferralGenerating] = useState(false);
  const [referralCopied, setReferralCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [referralPoints, setReferralPoints] = useState(cachedReferral ? cachedReferral.referralPoints : 0);
  const [totalReferrals, setTotalReferrals] = useState(cachedReferral ? cachedReferral.totalReferrals : 0);
  const [referralHistory, setReferralHistory] = useState(cachedReferral ? cachedReferral.history : []);

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
  const [otpResetVerified, setOtpResetVerified] = useState(false);
  const [showShopOtpResetModal, setShowShopOtpResetModal] = useState(false);
  const [otpResetNewPassword, setOtpResetNewPassword] = useState('');
  const [otpResetConfirmPassword, setOtpResetConfirmPassword] = useState('');
  const [otpResetLoading, setOtpResetLoading] = useState(false);
  const [otpResetError, setOtpResetError] = useState('');

  // Edit Login Credentials - email and phone are both valid login
  // identifiers (see AuthService.login), so either can be changed here.
  // The new value must be OTP-verified (OtpVerificationModal, purpose
  // 'change-credentials') before AuthService.updateLoginCredentials will
  // accept it - see that method for the verification-window check.
  const [editingCredField, setEditingCredField] = useState(null); // 'email' | 'phone' | null
  const [credNewValue, setCredNewValue] = useState('');
  const [credFieldError, setCredFieldError] = useState('');
  const [credSaving, setCredSaving] = useState(false);
  const [showCredOtpModal, setShowCredOtpModal] = useState(false);
  useBackHandler(showCredOtpModal, () => setShowCredOtpModal(false));

  useEffect(() => {
    fetchSettings();
    fetchReferralOverview();
  }, []);

  // Single unified verification document type for Shop Settings uploads (see
  // SHOP_DOCUMENT_TYPES.VERIFICATION_DOCUMENT in backend/src/common/shop-document.util.ts).
  // The legacy SHOP_PHOTO/SHOP_LICENSE/OWNER_AADHAAR rows created at registration
  // time are left dormant in the DB - not shown or editable here anymore.
  const VERIFICATION_DOC_TYPE = 'VERIFICATION_DOCUMENT';

  const fetchSettings = async () => {
    setLoading(true);
    setSettingsError('');
    try {
      const res = await api.getSettings(shopId);
      setShopName(res.name);
      setLogoUrl(res.logoUrl || null);

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

      // Verification document now comes from the relational ShopDocument
      // table (res.documents), not from companyDetails JSON. Only the
      // most-recent active VERIFICATION_DOCUMENT row is kept (the backend
      // already soft-deletes the previous one on replace, but findMany could
      // still return more than one in edge cases, so pick the newest
      // defensively).
      const verificationDocs = (res.documents || []).filter(d => d.documentType === VERIFICATION_DOC_TYPE);
      verificationDocs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setVerificationDoc(verificationDocs[0] || null);
    } catch (e) {
      console.error(e);
      // Surfaced so a failed fetch (flaky mobile network, expired session,
      // etc.) doesn't silently leave every field blank with no indication
      // anything went wrong - previously this just logged to the console.
      setSettingsError(e.message || t('failedLoadShopSettingsMsg'));
    } finally {
      setLoading(false);
    }
  };

  const persistCompanyDetails = async (overrides = {}) => {
    const companyDetails = JSON.stringify({ address, phone, gst, ...overrides });
    await api.updateSettings({ name: shopName, companyDetails }, shopId);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!PHONE_REGEX.test(phone)) {
      alert(PHONE_REGEX_MESSAGE);
      return;
    }
    try {
      await persistCompanyDetails();
      alert(t('shopWorkspaceSettingsSavedMsg'));
    } catch (e) {
      alert(e.message);
    }
  };

  const handleDocFileSelected = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert(t('fileSizeExceeds5MBMsg'));
      return;
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      alert(t('onlyJpegPngPdfMsg'));
      return;
    }
    setDocUploading(true);
    try {
      // Backend soft-deletes any existing active VERIFICATION_DOCUMENT row and
      // creates a new one - no separate delete call needed here.
      const uploaded = await api.uploadSettingsDocument(VERIFICATION_DOC_TYPE, file, shopId);
      setVerificationDoc(uploaded);
    } catch (err) {
      alert(err.message || t('documentUploadFailedMsg'));
    } finally {
      setDocUploading(false);
    }
  };

  const handleLogoFileSelected = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert(t('fileSizeExceeds5MBMsg'));
      return;
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alert(t('onlyJpegPngWebpMsg', 'Only JPEG, PNG, and WebP images are accepted.'));
      return;
    }
    setLogoUploading(true);
    try {
      const updated = await api.uploadShopLogo(file, shopId);
      setLogoUrl(updated.logoUrl || null);
    } catch (err) {
      alert(err.message || t('documentUploadFailedMsg'));
    } finally {
      setLogoUploading(false);
    }
  };

  const handleCaptureDocPhoto = async () => {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        quality: 85,
      });
      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      const file = new File([blob], `verification_document.${photo.format || 'jpg'}`, { type: blob.type || 'image/jpeg' });
      await handleDocFileSelected(file);
    } catch (err) {
      // User cancelling the native camera sheet rejects the promise - not a
      // real error, so only surface genuine failures.
      if (err && err.message && !/cancell?ed/i.test(err.message)) {
        alert(err.message || t('documentUploadFailedMsg'));
      }
    }
  };

  const handleDocRemove = async () => {
    if (!verificationDoc) return;
    if (!confirm(t('removeThisDocumentConfirm'))) return;
    try {
      await api.deleteSettingsDocument(verificationDoc.id, shopId);
      setVerificationDoc(null);
    } catch (err) {
      alert(err.message || t('failedRemoveDocumentMsg'));
    }
  };

  const fetchReferralOverview = async () => {
    try {
      const res = await api.getReferralOverview(shopId);
      const overview = {
        referralCode: res.referralCode || null,
        referralPoints: res.referralPoints || 0,
        totalReferrals: res.totalReferrals || 0,
        history: res.history || [],
      };
      setReferralCode(overview.referralCode);
      setReferralPoints(overview.referralPoints);
      setTotalReferrals(overview.totalReferrals);
      setReferralHistory(overview.history);
      referralOverviewCache[referralCacheKey] = overview;
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateReferralCode = async () => {
    setReferralGenerating(true);
    try {
      const { referralCode: code } = await api.generateReferralCode(shopId);
      setReferralCode(code);
    } catch (err) {
      alert(err.message || t('failedGenerateReferralCodeMsg'));
    } finally {
      setReferralGenerating(false);
    }
  };

  const handleCopyReferralCode = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      setReferralCopied(true);
      setTimeout(() => setReferralCopied(false), 2000);
    } catch (err) {
      // Clipboard API unavailable - fall through silently, user can still
      // read/copy the code manually from the screen.
    }
  };

  const referralShareMessage = () => t('referralShareMessageTemplate').replace('{code}', referralCode || '').replace('{url}', KEE_LANDING_PAGE_URL);

  const handleShareReferralWhatsApp = () => {
    if (!referralCode) return;
    const url = `https://wa.me/?text=${encodeURIComponent(referralShareMessage())}`;
    window.open(url, '_blank');
  };

  const handleCopyReferralLink = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralShareMessage());
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      // Clipboard API unavailable - nothing further to fall back to here.
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
      setPassVerifyError(err.message || t('incorrectPasswordEnteredMsg'));
    } finally {
      setPassVerifyLoading(false);
    }
  };

  // OTP Reset handlers
  const handleOtpResetSend = () => {
    if (!otpResetIdentifier) {
      alert(t('pleaseEnterRegisteredEmailPhoneMsg'));
      return;
    }
    setOtpResetError('');
    setShowShopOtpResetModal(true);
  };

  const handleOtpResetSubmit = async (e) => {
    e.preventDefault();
    if (otpResetNewPassword !== otpResetConfirmPassword) {
      setOtpResetError(t('passwordsDoNotMatchMsg'));
      return;
    }
    setOtpResetLoading(true);
    try {
      await api.resetPasswordPublic(otpResetIdentifier, otpResetMethod || 'email', otpResetNewPassword);
      setRevealedPasswordVal(otpResetNewPassword);
      alert(t('passwordUpdatedSuccessfullyMsg'));
      setOtpResetOpen(false);
      // Reset flow variables
      setOtpResetVerified(false);
      setOtpResetIdentifier('');
      setOtpResetNewPassword('');
      setOtpResetConfirmPassword('');
    } catch (err) {
      setOtpResetError(err.message || t('failedUpdatePasswordMsg'));
    } finally {
      setOtpResetLoading(false);
    }
  };

  // Edit Login Credentials handlers
  const startEditCredential = (field) => {
    setEditingCredField(field);
    setCredNewValue('');
    setCredFieldError('');
  };

  const cancelEditCredential = () => {
    setEditingCredField(null);
    setCredNewValue('');
    setCredFieldError('');
  };

  const handleRequestCredentialOtp = () => {
    const value = credNewValue.trim();
    if (!value) {
      setCredFieldError(t('pleaseEnterNewValueMsg'));
      return;
    }
    if (editingCredField === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        setCredFieldError(t('pleaseEnterValidEmailMsg'));
        return;
      }
      if (user.email && value.toLowerCase() === user.email.toLowerCase()) {
        setCredFieldError(t('newValueSameAsCurrentMsg'));
        return;
      }
    } else {
      if (!PHONE_REGEX.test(value)) {
        setCredFieldError(PHONE_REGEX_MESSAGE);
        return;
      }
      if (user.phone && value === user.phone) {
        setCredFieldError(t('newValueSameAsCurrentMsg'));
        return;
      }
    }
    setCredFieldError('');
    setShowCredOtpModal(true);
  };

  const handleCredentialOtpVerified = async () => {
    setCredSaving(true);
    setCredFieldError('');
    try {
      const value = credNewValue.trim();
      const payload = editingCredField === 'email'
        ? { newEmail: value }
        : { newPhone: value };
      await api.updateLoginCredentials(payload);
      alert(t('loginCredentialsUpdatedMsg'));
      cancelEditCredential();
    } catch (err) {
      setCredFieldError(err.message || t('failedUpdateCredentialsMsg'));
    } finally {
      setCredSaving(false);
    }
  };

  const refreshAll = () => {
    fetchSettings();
    fetchReferralOverview();
  };

  if (loading) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 260 }}>
        <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--gold)' }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('loadingWorkspaceSettingsMsg')}</span>
      </div>
    );
  }

  // A failed fetch (flaky network, expired session, etc.) used to leave every
  // field silently blank with no indication anything went wrong. Show a
  // dedicated error state with a retry action instead of a broken-looking form.
  if (settingsError) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, minHeight: 260, textAlign: 'center' }}>
        <div className="icon-badge red" style={{ width: 44, height: 44, borderRadius: '50%' }}><AlertTriangle /></div>
        <div>
          <p style={{ fontWeight: 800, color: 'var(--text-0)', fontFamily: 'var(--display)', marginBottom: 4 }}>{t('failedLoadShopSettingsMsg')}</p>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>{settingsError}</p>
        </div>
        <button onClick={refreshAll} className="btn btn-primary">
          <RefreshCw className="h-4 w-4" /><span>{t('btnRetry')}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1>{t('settings')}</h1>
        </div>
      </div>

      <div className="grid-2">
        <div>
          <div className="card">
            <div className="section-title">
              <h2 style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Store style={{ width: 16, height: 16, color: 'var(--gold)' }} />
                {t('workspaceProfileTitle')}
              </h2>
              <span className="sub">{t('businessIdentityContactDesc')}</span>
            </div>

            <form onSubmit={handleUpdate}>
              <div className="reg-section">
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Store /></div><b>{t('workspaceDisplayNameLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input type="text" required value={shopName} onChange={(e) => setShopName(e.target.value)} />
                  </div>
                </div>

                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--skyblue)' }}><Phone /></div><b>{t('phoneNumberLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91..." />
                  </div>
                </div>

                <div className="reg-field" style={{ marginBottom: 0 }}>
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--pink)' }}><MapPin /></div><b>{t('registeredAddressLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input type="text" required value={address} onChange={(e) => setAddress(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Shop Logo Section - shown on the public Shop Details page,
                  falling back to a category icon when absent (see
                  PublicShopDetailsScreen). Simpler than the Verification
                  Document upload below: a single always-current image, no
                  document "type" concept, upload immediately replaces it. */}
              <div className="reg-section" style={{ marginBottom: 0 }}>
                <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    <span className="icon-badge teal" style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0 }}><ImageIcon style={{ width: 10, height: 10 }} /></span>
                    {t('shopLogoLabel', 'Shop Logo')}
                  </span>
                  {logoUrl ? (
                    <div style={{ height: 110, width: 110, borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--border-2)', background: '#fff' }}>
                      <img src={getAssetUrl(logoUrl)} className="w-full h-full object-cover" alt={t('shopLogoLabel', 'Shop Logo')} />
                    </div>
                  ) : (
                    <div style={{ height: 110, width: 110, borderRadius: '50%', border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
                      <ImageIcon style={{ width: 24, height: 24 }} />
                    </div>
                  )}
                  <div className="flex gap-2">
                    {IS_NATIVE_APP && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
                            const photo = await Camera.getPhoto({ resultType: CameraResultType.Uri, source: CameraSource.Camera, quality: 85 });
                            const response = await fetch(photo.webPath);
                            const blob = await response.blob();
                            const file = new File([blob], `shop_logo.${photo.format || 'jpg'}`, { type: blob.type || 'image/jpeg' });
                            await handleLogoFileSelected(file);
                          } catch (err) {
                            if (err && err.message && !/cancell?ed/i.test(err.message)) {
                              alert(err.message || t('documentUploadFailedMsg'));
                            }
                          }
                        }}
                        disabled={logoUploading}
                        className="btn btn-ghost btn-sm"
                        style={{ flex: 1, fontSize: 10.5, padding: '8px 10px', opacity: logoUploading ? 0.6 : 1 }}
                      >
                        <Camera style={{ width: 12, height: 12 }} />
                        <span>{t('useCameraBtn')}</span>
                      </button>
                    )}
                    <label className="btn btn-ghost btn-sm" style={{ flex: 1, fontSize: 10.5, padding: '8px 10px', cursor: logoUploading ? 'not-allowed' : 'pointer', opacity: logoUploading ? 0.6 : 1 }}>
                      {logoUploading ? <RefreshCw className="animate-spin" style={{ width: 12, height: 12 }} /> : <Upload style={{ width: 12, height: 12 }} />}
                      <span>{logoUploading ? t('uploadingEllipsisLabel') : (logoUrl ? t('changeLogoBtn', 'Change Logo') : t('uploadLogoBtn', 'Upload Logo'))}</span>
                      <input
                        type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={logoUploading}
                        onClick={primeStoragePermission}
                        onChange={(e) => { const file = e.target.files[0]; e.target.value = ''; handleLogoFileSelected(file); }}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Shop Verification Document Section */}
              <div className="reg-section" style={{ marginBottom: 0 }}>
                {(() => {
                  const value = verificationDoc;
                  const isPdf = value && value.fileUrl && value.fileUrl.toLowerCase().endsWith('.pdf');
                  return (
                    <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320 }}>
                      <div className="flex items-center justify-between">
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                          <span className="icon-badge purple" style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0 }}><FileCheck style={{ width: 10, height: 10 }} /></span>
                          {t('verificationDocumentLabel')}
                        </span>
                        <span className={`badge ${value ? 'badge-active' : 'badge-pending'}`} style={{ padding: '2px 8px', fontSize: 9 }}>
                          <span className="dot"></span>{value ? t('uploadedBadge') : t('missingBadge')}
                        </span>
                      </div>
                      {value ? (
                        <div style={{ height: 140, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-2)', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {isPdf ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--red)', fontWeight: 800 }}>
                              <FileText style={{ width: 15, height: 15 }} /> {t('pdfFileLabel')}
                            </span>
                          ) : (
                            <img src={getAssetUrl(value.fileUrl)} className="w-full h-full object-cover" alt={t('verificationDocumentLabel')} />
                          )}
                        </div>
                      ) : (
                        <div style={{ height: 140, borderRadius: 10, border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
                          <FileCheck style={{ width: 24, height: 24 }} />
                        </div>
                      )}
                      <div className="flex gap-2">
                        {value ? (
                          <>
                            <button
                              type="button"
                              onClick={() => downloadAsset(value.fileUrl, value.originalName || filenameForAsset(value.fileUrl, 'verification_document'))}
                              className="btn btn-primary btn-sm"
                              style={{ flex: 1, fontSize: 10.5, padding: '8px 10px' }}
                            >
                              <Download style={{ width: 12, height: 12 }} />
                              <span>{t('downloadTitleLabel')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleDocRemove}
                              className="btn btn-danger-outline btn-sm"
                              style={{ flex: 1, fontSize: 10.5, padding: '8px 10px' }}
                            >
                              <Trash style={{ width: 12, height: 12 }} />
                              <span>{t('btnRemove')}</span>
                            </button>
                          </>
                        ) : (
                          <>
                            {IS_NATIVE_APP && (
                              <button
                                type="button"
                                onClick={handleCaptureDocPhoto}
                                disabled={docUploading}
                                className="btn btn-ghost btn-sm"
                                style={{ flex: 1, fontSize: 10.5, padding: '8px 10px', opacity: docUploading ? 0.6 : 1 }}
                              >
                                <Camera style={{ width: 12, height: 12 }} />
                                <span>{t('useCameraBtn')}</span>
                              </button>
                            )}
                            <label className="btn btn-ghost btn-sm" style={{ flex: 1, fontSize: 10.5, padding: '8px 10px', cursor: docUploading ? 'not-allowed' : 'pointer', opacity: docUploading ? 0.6 : 1 }}>
                              {docUploading ? <RefreshCw className="animate-spin" style={{ width: 12, height: 12 }} /> : <Upload style={{ width: 12, height: 12 }} />}
                              <span>{docUploading ? t('uploadingEllipsisLabel') : t('chooseFromGalleryBtn')}</span>
                              <input
                                type="file" accept="image/jpeg,image/png,application/pdf" className="hidden" disabled={docUploading}
                                onClick={primeStoragePermission}
                                onChange={(e) => { const file = e.target.files[0]; e.target.value = ''; handleDocFileSelected(file); }}
                              />
                            </label>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="form-action-bar flex justify-end" style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 20 }}>
                <button type="submit" className="btn btn-primary">
                  <Check />
                  <span>{t('saveWorkspaceDetailsBtn')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        <div>
          {/* Admin User Credentials Block - this is the logged-in user's own
          account/password, so it's meaningless (and hidden) when a Super
          Admin is managing another shop's settings on its behalf. */}
          {!shopId && (
            <div className="card">
              <div className="section-title">
                <h2 style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShieldCheck style={{ width: 16, height: 16, color: 'var(--gold)' }} />
                  {t('adminCredentialsTitle')}
                </h2>
              </div>

              <div className="reg-section">
                <div className="reg-field" style={{ marginBottom: 12 }}>
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><User /></div><b>{t('usernameNameLabel')}</b></div>
                  <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-0)', fontFamily: 'var(--display)' }}>{user.name}</p>
                </div>
                <div className="reg-field" style={{ marginBottom: 12 }}>
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Mail /></div><b>{t('emailAddressLabel')}</b></div>
                  {editingCredField === 'email' ? (
                    <div>
                      <div className="input-wrap">
                        <input
                          type="email"
                          autoFocus
                          disabled={credSaving}
                          value={credNewValue}
                          onChange={(e) => setCredNewValue(e.target.value)}
                          placeholder={t('enterNewEmailPlaceholder')}
                        />
                      </div>
                      {credFieldError && <p style={{ fontSize: 11.5, color: 'var(--red)', fontWeight: 700, marginTop: 6 }}>{credFieldError}</p>}
                      <div className="flex gap-2" style={{ marginTop: 8 }}>
                        <button type="button" disabled={credSaving} onClick={cancelEditCredential} className="btn btn-ghost" style={{ flex: 1 }}>{t('btnCancel')}</button>
                        <button type="button" disabled={credSaving} onClick={handleRequestCredentialOtp} className="btn btn-primary" style={{ flex: 2 }}>
                          {credSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : t('sendOtpBtn')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-0)' }}>{user.email || t('noEmailOnFileLabel')}</p>
                      <button onClick={() => startEditCredential('email')} className="icon-btn" title={t('editLoginCredentialTitle')}>
                        <Edit style={{ width: 14, height: 14 }} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="reg-field" style={{ marginBottom: 0 }}>
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--teal)' }}><Phone /></div><b>{t('phoneNumberLabel')}</b></div>
                  {editingCredField === 'phone' ? (
                    <div>
                      <div className="input-wrap">
                        <input
                          type="tel"
                          autoFocus
                          disabled={credSaving}
                          value={credNewValue}
                          onChange={(e) => setCredNewValue(e.target.value)}
                          placeholder={t('enterNewPhonePlaceholder')}
                        />
                      </div>
                      {credFieldError && <p style={{ fontSize: 11.5, color: 'var(--red)', fontWeight: 700, marginTop: 6 }}>{credFieldError}</p>}
                      <div className="flex gap-2" style={{ marginTop: 8 }}>
                        <button type="button" disabled={credSaving} onClick={cancelEditCredential} className="btn btn-ghost" style={{ flex: 1 }}>{t('btnCancel')}</button>
                        <button type="button" disabled={credSaving} onClick={handleRequestCredentialOtp} className="btn btn-primary" style={{ flex: 2 }}>
                          {credSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : t('sendOtpBtn')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-0)' }}>{user.phone || 'N/A'}</p>
                      <button onClick={() => startEditCredential('phone')} className="icon-btn" title={t('editLoginCredentialTitle')}>
                        <Edit style={{ width: 14, height: 14 }} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="reg-section" style={{ marginBottom: 0 }}>
                <div className="reg-field" style={{ marginBottom: 14 }}>
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--maroon)' }}><KeyRound /></div><b>{t('workspacePasswordLabel')}</b></div>
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
                      title={revealPassword ? t('hidePasswordTitle') : t('revealPasswordTitle')}
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
                  <span>{t('forgotPasswordResetOtpBtn')}</span>
                </button>
              </div>
            </div>
          )}

          {/* Referral & Rewards Block */}
          <div className="card" style={{ marginTop: shopId ? 0 : 20 }}>
            <div className="section-title">
              <h2 style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <BadgePercent style={{ width: 16, height: 16, color: 'var(--gold)' }} />
                {t('referralProgramTitle')}
              </h2>
              <span className="sub">{t('referralProgramDesc')}</span>
            </div>

            {referralCode ? (
              <div>
                <div className="flex items-center justify-between" style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 13, padding: '12px 16px', marginBottom: 14 }}>
                  <span style={{ color: 'var(--gold)', fontFamily: 'monospace', fontWeight: 800, fontSize: 16, letterSpacing: '.1em' }}>{referralCode}</span>
                  <button onClick={handleCopyReferralCode} className="icon-btn" title={t('copyTitle')}>
                    {referralCopied ? <CheckCircle2 style={{ color: 'var(--green)' }} /> : <Copy />}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 14 }}>
                  <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 13, padding: '14px 16px', textAlign: 'center' }}>
                    <Award style={{ width: 15, height: 15, color: 'var(--gold)' }} />
                    <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--display)', color: 'var(--text-0)', marginTop: 4 }}>{referralPoints}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', marginTop: 2 }}>{t('totalReferralPointsLabel')}</div>
                  </div>
                  <div style={{ background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 13, padding: '14px 16px', textAlign: 'center' }}>
                    <Users style={{ width: 15, height: 15, color: 'var(--blue)' }} />
                    <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--display)', color: 'var(--text-0)', marginTop: 4 }}>{totalReferrals}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', marginTop: 2 }}>{t('totalSuccessfulReferralsLabel')}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2" style={{ marginBottom: 16 }}>
                  <button onClick={handleShareReferralWhatsApp} className="btn btn-primary">
                    <svg viewBox="0 0 24 24" style={{ width: 16, height: 16 }} fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12.004 2C6.486 2 2 6.486 2 12.004c0 1.85.505 3.649 1.462 5.207L2 22l4.933-1.437a9.96 9.96 0 0 0 5.071 1.39h.004c5.518 0 10.004-4.486 10.004-10.005C22.012 6.486 17.522 2 12.004 2zm0 18.155h-.003a8.14 8.14 0 0 1-4.153-1.14l-.298-.177-3.09.9.918-3.02-.194-.309a8.13 8.13 0 0 1-1.257-4.405c0-4.494 3.657-8.15 8.156-8.15 2.178 0 4.225.85 5.766 2.393a8.096 8.096 0 0 1 2.386 5.762c-.002 4.494-3.658 8.15-8.156 8.15z"/></svg>
                    <span>{t('shareViaWhatsAppBtn')}</span>
                  </button>
                  <button onClick={handleCopyReferralLink} className="btn btn-outline">
                    {linkCopied ? <CheckCircle2 style={{ width: 16, height: 16, color: 'var(--green)' }} /> : <Link2 style={{ width: 16, height: 16 }} />}
                    <span>{t('copyLinkBtn')}</span>
                  </button>
                </div>

                <div>
                  <span className="side-section-label" style={{ padding: 0, marginBottom: 8, display: 'block' }}>{t('referralHistoryTitle')}</span>
                  {referralHistory.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>{t('noReferralsYetMsg')}</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {referralHistory.map((r, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 13, padding: '10px 14px' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.shopName}</div>
                            <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600, marginTop: 2 }}>{new Date(r.registeredAt).toLocaleDateString()}</div>
                          </div>
                          <span style={{ flexShrink: 0, background: 'var(--gold-dim)', color: 'var(--gold)', fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '4px 10px' }}>+{r.pointsEarned} pt</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <button onClick={handleGenerateReferralCode} disabled={referralGenerating} className="btn btn-primary btn-block">
                {referralGenerating ? <RefreshCw className="animate-spin" /> : <BadgePercent />}
                <span>{referralGenerating ? t('generatingEllipsisLabel') : t('generateReferralCodeBtn')}</span>
              </button>
            )}
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
              <h2 style={{ fontSize: 18 }}>{t('confirmYourPasswordTitle')}</h2>
              <p style={{ color: 'var(--text-3)', fontSize: 12, fontWeight: 600, marginTop: 4 }}>{t('verifyIdentityRevealDesc')}</p>
            </div>

            <form onSubmit={handlePasswordVerificationSubmit}>
              {passVerifyError && (
                <div style={{ display: 'flex', gap: 8, background: 'var(--red-dim)', border: '1px solid rgba(220,38,38,0.35)', padding: 10, borderRadius: 12, fontSize: 12, color: '#b91c1c', marginBottom: 16, fontWeight: 600 }}>
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{passVerifyError}</span>
                </div>
              )}

              <div className="reg-field">
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Lock /></div><b>{t('accountPasswordLabel')} <span className="req">*</span></b></div>
                <div className="input-wrap">
                  <input
                    type={showVerifyPass ? "text" : "password"} required value={passVerifyInput} onChange={(e) => setPassVerifyInput(e.target.value)}
                    placeholder={t('enterPasswordPlaceholder')} style={{ paddingRight: 42 }}
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
                <button type="button" onClick={() => { setShowPassVerifyModal(false); setPassVerifyError(''); }} className="btn btn-ghost" style={{ flex: 1 }}>{t('btnCancel')}</button>
                <button type="submit" disabled={passVerifyLoading} className="btn btn-primary" style={{ flex: 2 }}>
                  {passVerifyLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : t('btnConfirm')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      <Suspense fallback={null}>
      <OtpVerificationModal
        open={showCredOtpModal}
        onClose={() => setShowCredOtpModal(false)}
        onVerified={handleCredentialOtpVerified}
        api={api}
        identifier={credNewValue.trim()}
        method={editingCredField || 'email'}
        purpose="change-credentials"
        title={t('verifyOtpModalTitle')}
        description={t('fourDigitCodeDispatchedTemplate').replace('{identifier}', credNewValue.trim())}
        t={t}
      />
      </Suspense>

      {/* OTP Password Reset Modal inside Settings */}
      {otpResetOpen && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center p-4" style={{ background: 'rgba(5,4,3,0.82)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 440, margin: 'auto', padding: 28 }}>
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 18 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}><Lock /> {t('accountRecoveryEyebrow')}</span>
                <h2 style={{ fontSize: 18 }}>{t('resetAccountPasswordTitle')}</h2>
              </div>
              <button onClick={() => setOtpResetOpen(false)} className="icon-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            {!otpResetVerified ? (
              <div>
                <div className="store-tabs">
                  <button
                    type="button"
                    onClick={() => setOtpResetMethod('email')}
                    className={`store-tab ${otpResetMethod === 'email' || !otpResetMethod ? 'active' : ''}`}
                    style={{ flex: 1 }}
                  >
                    {t('emailRecoveryTab')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOtpResetMethod('phone')}
                    className={`store-tab ${otpResetMethod === 'phone' ? 'active' : ''}`}
                    style={{ flex: 1 }}
                  >
                    {t('phoneRecoveryTab')}
                  </button>
                </div>
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: otpResetMethod === 'phone' ? 'var(--teal)' : 'var(--blue)' }}>{otpResetMethod === 'phone' ? <Phone /> : <Mail />}</div><b>{otpResetMethod === 'phone' ? t('registeredPhoneNumberLabel') : t('registeredEmailAddressLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type="text" required value={otpResetIdentifier} onChange={(e) => setOtpResetIdentifier(e.target.value)}
                      placeholder={otpResetMethod === 'phone' ? '+91 99999 99999' : 'owner@shop.com'}
                    />
                  </div>
                </div>
                {otpResetError && <div style={{ color: '#b91c1c', fontSize: 12, fontWeight: 600, marginBottom: 14 }}>{otpResetError}</div>}
                <button
                  onClick={handleOtpResetSend}
                  className="btn btn-primary btn-block"
                >
                  <Mail />
                  <span>{t('sendOtpVerificationCodeBtn')}</span>
                </button>

                <Suspense fallback={null}>
                <OtpVerificationModal
                  open={showShopOtpResetModal}
                  onClose={() => setShowShopOtpResetModal(false)}
                  onVerified={() => setOtpResetVerified(true)}
                  api={api}
                  identifier={otpResetIdentifier}
                  method={otpResetMethod || 'email'}
                  purpose="reset"
                  title={t('verifyOtpModalTitle')}
                  description={t('fourDigitCodeDispatchedTemplate').replace('{identifier}', otpResetIdentifier)}
                  t={t}
                />
                </Suspense>
              </div>
            ) : (
              <form onSubmit={handleOtpResetSubmit}>
                {otpResetError && <div style={{ color: '#b91c1c', fontSize: 12, fontWeight: 600, marginBottom: 14 }}>{otpResetError}</div>}
                <div className="reg-field">
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><Lock /></div><b>{t('newPasswordLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type={otpShowNewPass ? "text" : "password"} required value={otpResetNewPassword} onChange={(e) => setOtpResetNewPassword(e.target.value)}
                      placeholder={t('min6CharactersPlaceholder')} style={{ paddingRight: 42 }}
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
                  <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--rose)' }}><Lock /></div><b>{t('confirmPasswordLabel')} <span className="req">*</span></b></div>
                  <div className="input-wrap">
                    <input
                      type={otpShowConfirmPass ? "text" : "password"} required value={otpResetConfirmPassword} onChange={(e) => setOtpResetConfirmPassword(e.target.value)}
                      placeholder={t('retypePasswordPlaceholder')} style={{ paddingRight: 42 }}
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
                  {otpResetLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : t('updatePasswordBtn')}
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
      alert(t('failedGenerateReportMsg'));
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCSV = () => {
    if (reportData.length === 0) {
      alert(t('pleaseGenerateReportFirstMsg'));
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
      alert(t('pleaseGenerateReportFirstMsg'));
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
          <div className="eyebrow"><BarChart3 /> {t('complianceAnalyticsEyebrow')}</div>
          <h1>{t('reports')}</h1>
          <p>{t('reportsPortalDesc')}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'clamp(16px, 4vw, 24px)' }}>
        <div className="section-title" style={{ marginBottom: 18 }}>
          <h2>{t('reportBuilderTitle')}</h2>
          <span className="sub">{t('selectDateRangeGenerateDesc')}</span>
        </div>

        <form onSubmit={handleGenerate}>
          <div className="reg-section">
            <div className="row2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="reg-field" style={{ marginBottom: 0 }}>
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--blue)' }}><Calendar /></div><b>{t('fromDateLabel')}</b></div>
                <div className="input-wrap">
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </div>
              </div>
              <div className="reg-field" style={{ marginBottom: 0 }}>
                <div className="reg-field-label"><div className="reg-ico" style={{ background: 'var(--purple)' }}><CalendarRange /></div><b>{t('toDateLabel')}</b></div>
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
            <span>{loading ? t('generatingEllipsisLabel') : t('generateReportBtn')}</span>
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
              <div className="stat-label">{t('recordsInReportLabel')}</div>
            </div>
            <div className="stat-card" style={{ animationDelay: '.15s' }}>
              <div className="stat-top">
                <div className="icon-badge blue"><Calendar /></div>
              </div>
              <div className="stat-num" style={{ fontSize: 18 }}>{fromDate || t('allTimeLabel')} &rarr; {toDate || t('todayLabel')}</div>
              <div className="stat-label">{t('dateRangeCoveredLabel')}</div>
            </div>
          </div>

          {/* Graphical Report Chart Visualization */}
          <div className="card chart-card" style={{ marginBottom: 24 }}>
            <div className="section-title">
              <h2>{t('visualReportSummaryTitle')}</h2>
              <span className="sub">{t('hoverToViewValuesDesc')}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Left Column: Bar Chart */}
              <div>
                <h4 className="bar-label" style={{ textAlign: 'center', marginBottom: 10, fontSize: 11 }}>
                  {t('registrationsByKeyBlankRefTitle')}
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
                  {t('registrationTimelineTrendTitle')}
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

                    if (dataPoints.length === 0) return <div className="text-center py-12" style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>{t('noTrendDataMsg')}</div>;

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
              <span>{t('hoverToViewValuesDesc')}</span>
            </div>
          </div>

          <div className="card table-card">
            <div className="table-head">
              <h2 style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 17 }}>
                {t('reportPreviewTitle')} <span style={{ color: 'var(--text-3)', fontWeight: 700, fontSize: 13 }}>({reportData.length} {t('recordsLabel')})</span>
              </h2>
              <div className="row-actions" style={{ gap: 10 }}>
                <button onClick={handleDownloadCSV} className="btn btn-outline btn-sm">
                  <Download />
                  <span>{t('exportCsvBtn')}</span>
                </button>
                <button onClick={handleDownloadTXT} className="btn btn-primary btn-sm">
                  <Download />
                  <span>{t('exportTxtBtn')}</span>
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
            <p style={{ padding: '14px 24px', fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>{t('showingFirstColumnsPreviewDesc')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
