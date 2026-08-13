// Complete-ish reference list of Tamil Nadu's 38 districts, each paired with
// its headquarters city plus a broad set of well-known municipalities/towns
// (sourced from the state's official urban local body listings, e.g.
// https://en.wikipedia.org/wiki/List_of_urban_local_bodies_in_Tamil_Nadu).
// Used to power the public Shops/Machines tabs' location dropdown (and the
// authenticated app's equivalent ECM/Scanning/Key Shops/Meter/Dealers
// screens) with a full, static list of selectable locations - independent of
// which towns currently have a registered shop, unlike the old
// dynamically-built dropdown (see ShopService.getPublicShopTowns, since
// removed). A location with zero matching shops is expected to just show an
// empty result, not be hidden from the list.
export const TAMIL_NADU_LOCATIONS = [
  { district: 'Ariyalur', towns: ['Ariyalur', 'Jayankondam', 'Udayarpalayam'] },
  { district: 'Chengalpattu', towns: ['Chengalpattu', 'Maduranthakam', 'Mamallapuram', 'Maraimalai Nagar', 'Guduvancheri', 'Tambaram', 'Chromepet', 'Pallavaram', 'Tirukalukundram'] },
  { district: 'Chennai', towns: ['Chennai'] },
  { district: 'Coimbatore', towns: ['Coimbatore', 'Mettupalayam', 'Karamadai', 'Sulur', 'Pollachi', 'Valparai', 'Kinathukadavu', 'Annur'] },
  { district: 'Cuddalore', towns: ['Cuddalore', 'Chidambaram', 'Panruti', 'Nellikuppam', 'Tittakudi', 'Vadalur', 'Virudhachalam', 'Neyveli', 'Kurinjipadi'] },
  { district: 'Dharmapuri', towns: ['Dharmapuri', 'Harur', 'Palacode', 'Pennagaram'] },
  { district: 'Dindigul', towns: ['Dindigul', 'Kodaikanal', 'Oddanchatram', 'Palani', 'Vedasandur', 'Natham'] },
  { district: 'Erode', towns: ['Erode', 'Bhavani', 'Gobichettipalayam', 'Kavandapadi', 'Perundurai', 'Punjai Puliampatti', 'Sathyamangalam', 'Nambiyur', 'Anthiyur', 'Chennimalai', 'Kodumudi', 'Modakkurichi', 'Talavadi'] },
  { district: 'Kallakurichi', towns: ['Kallakurichi', 'Tirukoilur', 'Ulundurpettai', 'Sankarapuram', 'Chinnasalem'] },
  { district: 'Kanchipuram', towns: ['Kanchipuram', 'Kundrathur', 'Mangadu', 'Sriperumbudur', 'Uthiramerur', 'Walajabad'] },
  { district: 'Kanyakumari', towns: ['Nagercoil', 'Padmanabhapuram', 'Kuzhithurai', 'Colachel', 'Kollankodu', 'Kanyakumari', 'Marthandam', 'Thuckalay'] },
  { district: 'Karur', towns: ['Karur', 'Kulithalai', 'Pallapatti', 'Pugalur', 'Krishnarayapuram', 'Aravakurichi'] },
  { district: 'Krishnagiri', towns: ['Krishnagiri', 'Hosur', 'Denkanikottai', 'Bargur', 'Uthangarai', 'Pochampalli'] },
  { district: 'Madurai', towns: ['Madurai', 'Melur', 'Thirumangalam', 'Usilampatti', 'Vadipatti', 'Peraiyur'] },
  { district: 'Mayiladuthurai', towns: ['Mayiladuthurai', 'Sirkazhi', 'Tharangambadi', 'Kuthalam'] },
  { district: 'Nagapattinam', towns: ['Nagapattinam', 'Vedaranyam', 'Sikkal', 'Kilvelur'] },
  { district: 'Namakkal', towns: ['Namakkal', 'Komarapalayam', 'Mohanur', 'Pallipalayam', 'Rasipuram', 'Tiruchengode', 'Paramathi-Velur'] },
  { district: 'Nilgiris', towns: ['Udagamandalam', 'Coonoor', 'Gudalur', 'Kotagiri', 'Nelliyalam', 'Pandalur'] },
  { district: 'Perambalur', towns: ['Perambalur', 'Kunnam', 'Veppanthattai'] },
  { district: 'Pudukkottai', towns: ['Pudukkottai', 'Aranthangi', 'Illupur', 'Karambakkudi', 'Gandarvakottai'] },
  { district: 'Ramanathapuram', towns: ['Ramanathapuram', 'Kilakarai', 'Paramakudi', 'Rameswaram', 'Kamuthi', 'Mudukulathur'] },
  { district: 'Ranipet', towns: ['Ranipet', 'Arakkonam', 'Arcot', 'Melvisharam', 'Sholinghur', 'Walajapet', 'Nemili'] },
  { district: 'Salem', towns: ['Salem', 'Attur', 'Edappadi', 'Mettur', 'Sangagiri', 'Tharamangalam', 'Omalur', 'Vazhapadi'] },
  { district: 'Sivaganga', towns: ['Sivaganga', 'Devakottai', 'Manamadurai', 'Karaikudi', 'Ilayangudi'] },
  { district: 'Tenkasi', towns: ['Tenkasi', 'Kadayanallur', 'Puliyankudi', 'Sankarankovil', 'Sengottai', 'Surandai', 'Alangulam'] },
  { district: 'Thanjavur', towns: ['Thanjavur', 'Adirampattinam', 'Pattukkottai', 'Thiruvaiyaru', 'Kumbakonam', 'Papanasam', 'Orathanadu'] },
  { district: 'Theni', towns: ['Theni', 'Bodinayakkanur', 'Chinnamanur', 'Cumbum', 'Gudalur', 'Periyakulam', 'Uthamapalayam', 'Andipatti'] },
  { district: 'Thoothukudi', towns: ['Thoothukudi', 'Kayalpatnam', 'Kovilpatti', 'Tiruchendur', 'Srivaikuntam', 'Ottapidaram'] },
  { district: 'Tiruchirappalli', towns: ['Tiruchirappalli', 'Manapparai', 'Musiri', 'Lalgudi', 'Thuraiyur', 'Srirangam', 'Manachanallur'] },
  { district: 'Tirunelveli', towns: ['Tirunelveli', 'Ambasamudram', 'Kalakkad', 'Vadakkuvalliyur', 'Vikramasingapuram', 'Palayamkottai', 'Cheranmahadevi'] },
  { district: 'Tirupathur', towns: ['Tirupathur', 'Ambur', 'Jolarpettai', 'Vaniyambadi', 'Natrampalli'] },
  { district: 'Tiruppur', towns: ['Tiruppur', 'Avinashi', 'Dharapuram', 'Kangeyam', 'Palladam', 'Udumalaipettai', 'Vellakoil', 'Uthukuli', 'Kundadam'] },
  { district: 'Tiruvallur', towns: ['Tiruvallur', 'Tiruttani', 'Ponneri', 'Veppampattu', 'Avadi', 'Poonamallee', 'Gummidipoondi'] },
  { district: 'Tiruvannamalai', towns: ['Tiruvannamalai', 'Arni', 'Chengam', 'Polur', 'Vandavasi', 'Cheyyar', 'Kilpennathur'] },
  { district: 'Tiruvarur', towns: ['Tiruvarur', 'Koothanallur', 'Mannargudi', 'Thiruthuraipoondi', 'Needamangalam', 'Nannilam'] },
  { district: 'Vellore', towns: ['Vellore', 'Gudiyatham', 'Pernambut', 'Katpadi', 'Anaicut'] },
  { district: 'Viluppuram', towns: ['Viluppuram', 'Kottakuppam', 'Tindivanam', 'Vanur', 'Gingee', 'Marakkanam'] },
  { district: 'Virudhunagar', towns: ['Virudhunagar', 'Aruppukkottai', 'Rajapalayam', 'Sattur', 'Srivilliputhur', 'Sivakasi', 'Kariapatti'] },
];

// Flattened, de-duplicated, alphabetically sorted list of every selectable
// location (district HQs + towns as one flat namespace - a shop's `town` or
// `district` field is matched against whichever exact value is picked, see
// ShopService.searchPublicShops). District names and town names never
// collide in practice, so a single flat list keeps the dropdown simple.
export const ALL_TN_LOCATIONS = Array.from(
  new Set(TAMIL_NADU_LOCATIONS.flatMap((d) => [d.district, ...d.towns]))
).sort((a, b) => a.localeCompare(b));
