import React, { useState, useEffect, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useBackHandler } from '../utils/backHandler';
import { downloadAsset } from '../apiConfig';
import { downloadPdf, sharePdf } from '../utils/pdfDelivery';
import { VEHICLE_CATEGORIES, isAutomobileCategory } from '../utils/vehicleCategory';
import { normalizePhone, PHONE_REGEX_MESSAGE } from '../utils/phone';
import { ALL_DOC_TYPES, INDIAN_STATES_DISTRICTS } from '../utils/registrationData';
import { IS_NATIVE_APP, primeStoragePermission } from '../utils/platform';
import { resolveCurrentLocation, reverseGeocode, openDeviceLocationSettings, openAppSettings } from '../utils/geolocation';
import CustomSelect from '../components/CustomSelect';
import twoWheelerIcon from '../assets/categories/two-wheeler.png';
import fourWheelerIcon from '../assets/categories/four-wheeler.png';
import truckLorryIcon from '../assets/categories/truck-lorry.png';
import homeCategoryIcon from '../assets/categories/home.png';
import officeCategoryIcon from '../assets/categories/office.png';
import addKeyIcon from '../assets/addlostkeys/bluekey.png';
import lostKeyIcon from '../assets/addlostkeys/redkey.png';
import {
  Key, Check, MapPin, Camera, AlertTriangle, RefreshCw, Edit, Eye, CheckCircle2,
  Lock, Phone, ArrowRight, ArrowLeft, Store, UserPlus, IndianRupee, User,
  UploadCloud, Crosshair, FileCheck, Navigation, KeyRound, Car, Download, Home, Save,
  X,
} from 'lucide-react';

// Lazy-loaded: pulls in the Capacitor Firebase Authentication SDK - see the
// identical import in App.jsx for why this is deferred rather than static.
const OtpVerificationModal = lazy(() => import('../components/OtpVerificationModal'));

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
    const { buildCustomerReportPdf } = await import('../utils/customerReportPdf');
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

export default CustomerRegistrationWizard;
