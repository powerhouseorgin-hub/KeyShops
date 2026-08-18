import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { updateMetaTags, getCanonicalUrl, getOGImageUrl } from '../utils/seoHelpers';

// Reusable landing page for each /services/:slug route, mirroring LocationPage.jsx's
// pattern - one component, real distinct content per slug, so every URL already
// listed in sitemap.xml resolves to genuine unique content instead of the SPA's
// unmatched-path fallback (see App.jsx's parseSpecialRoute).
const serviceData = {
  'duplicate-car-keys': {
    title: 'Duplicate Car Keys | Mechanical, Transponder & Smart Key Duplication',
    description: 'Get your car keys duplicated by verified key shops - mechanical, transponder, remote fob, and smart keys, with same-day service in most cities.',
    intro: 'A spare car key means a lost or locked-out key is an inconvenience, not an emergency. KeyShops.in connects you with verified shops that duplicate every common car key type, from a basic mechanical blade to a fully programmed smart key.',
    types: [
      { name: 'Mechanical keys', detail: 'Cut on the spot from your original in most shops - the fastest and cheapest option.' },
      { name: 'Transponder keys', detail: 'Contain a chip the car\'s immobiliser reads; duplication includes cutting the blade and programming the chip.' },
      { name: 'Remote key fobs', detail: 'Combine a mechanical or transponder key with remote lock/unlock buttons - duplication includes syncing the fob to your car.' },
      { name: 'Smart keys', detail: 'Keyless-entry fobs that some independent shops can programme; others require an authorized dealer.' }
    ],
    steps: [
      'Bring your existing working key - most duplication needs at least one original.',
      'The shop identifies your key type and confirms it can be duplicated on-site.',
      'The blank is cut (and, for transponder/smart keys, programmed) to match your original.',
      'Test both keys before you leave to confirm the duplicate works correctly.'
    ],
    pricing: 'Mechanical: ₹50-₹150 · Transponder: ₹200-₹500 · Remote fob: ₹300-₹500 · Smart key: ₹500-₹2,000',
    faq: [
      { q: 'Can I duplicate a car key without the original?', a: 'Independent key shops need your original key to duplicate it. Without one, an authorized dealer can cut a new key from your vehicle\'s VIN, which costs more and takes longer.' },
      { q: 'How long does car key duplication take?', a: 'Mechanical keys are usually ready in 5-15 minutes; transponder and remote keys take 30 minutes to 2 hours depending on programming complexity.' },
      { q: 'Will a duplicated key work exactly like the original?', a: 'Yes, when cut and programmed correctly by a certified shop - test it before leaving to confirm central locking, immobiliser, and remote functions all work.' }
    ]
  },
  'duplicate-bike-keys': {
    title: 'Duplicate Bike & Scooter Keys | Fast Motorcycle Key Duplication',
    description: 'Find verified shops for bike and scooter key duplication - mechanical and transponder keys for all major two-wheeler brands, with quick turnaround.',
    intro: 'Losing your only bike key can strand you far from home. KeyShops.in lists verified shops that duplicate keys for scooters and motorcycles across every major brand, most of it done while you wait.',
    types: [
      { name: 'Mechanical blade keys', detail: 'Standard on most scooters and older motorcycles - cut directly from your original.' },
      { name: 'Transponder-chip keys', detail: 'Used on newer motorcycles with electronic immobilisers - needs both cutting and chip programming.' },
      { name: 'Ignition + fuel-cap key sets', detail: 'Some models use one key for both ignition and fuel cap; shops can duplicate the full set together.' }
    ],
    steps: [
      'Bring the working key (or the bike itself, if the key is lost) to a nearby shop.',
      'The shop matches the correct blank for your bike\'s make and model.',
      'The key is cut and, if needed, programmed to the bike\'s immobiliser.',
      'Test the ignition and fuel cap before leaving to confirm the duplicate works.'
    ],
    pricing: 'Mechanical: ₹40-₹100 · Transponder: ₹150-₹350',
    faq: [
      { q: 'Can any key shop duplicate a bike key, or do I need the dealer?', a: 'Most independent key shops handle mechanical bike keys directly. Transponder-equipped models may need a shop with programming equipment for that specific brand - confirm before visiting.' },
      { q: 'How much does bike key duplication cost?', a: 'Mechanical keys typically cost ₹40-₹100; transponder-chip keys for newer models run ₹150-₹350.' },
      { q: 'What if I\'ve lost my only bike key?', a: 'A locksmith can often cut a new key directly from the ignition lock cylinder; for transponder-equipped bikes without a spare, this may need dealer-level programming equipment.' }
    ]
  },
  'home-key-duplication': {
    title: 'Home Key Duplication | Reliable Residential Key Copying Services',
    description: 'Duplicate home, apartment, and gate keys at verified local shops - standard, high-security, and padlock keys, usually ready in minutes.',
    intro: 'Whether you need a spare for a family member, a new tenant, or just a backup, KeyShops.in helps you find nearby shops that duplicate residential keys quickly and reliably.',
    types: [
      { name: 'Standard door keys', detail: 'Common pin-tumbler keys for most home locks - cut in minutes from your original.' },
      { name: 'High-security keys', detail: 'Restricted or patented key profiles that may require ID proof or dealer authorization to duplicate.' },
      { name: 'Padlock & gate keys', detail: 'Duplicated the same way as door keys, matched to the specific padlock or gate lock brand.' }
    ],
    steps: [
      'Bring your original key to a nearby shop - most home keys don\'t need the lock itself.',
      'The shop identifies the key profile and selects a matching blank.',
      'The key is cut on a manual or code-cutting machine to match your original.',
      'Test the duplicate in your lock before relying on it.'
    ],
    pricing: 'Standard keys: ₹20-₹80 · High-security/restricted keys: ₹100-₹300',
    faq: [
      { q: 'Can anyone walk in and duplicate my house key?', a: 'For standard keys, yes - which is why it\'s worth keeping track of who has copies. Restricted/high-security key profiles require ID or dealer authorization specifically to prevent unauthorized duplication.' },
      { q: 'How much does it cost to duplicate a house key?', a: 'Standard home keys typically cost ₹20-₹80; restricted or high-security profiles run ₹100-₹300 due to the specialized blanks and authorization required.' },
      { q: 'Can I get a home key duplicated the same day?', a: 'Yes - standard key duplication is usually done on the spot in a few minutes at most key shops.' }
    ]
  },
  'lost-key-replacement': {
    title: 'Lost Key Replacement | Emergency Car, Bike & Home Key Services',
    description: 'Locked out or lost your only key? Find verified shops offering emergency lost-key replacement for cars, bikes, and homes - including 24/7 options.',
    intro: 'A lost key is stressful, but it\'s solvable. KeyShops.in helps you find nearby shops and locksmiths that specialize in replacing lost car, bike, and home keys - including emergency and after-hours service where available.',
    types: [
      { name: 'Lost car key (with a spare elsewhere)', detail: 'A shop can duplicate from a second key if one exists, or cut a new one from your vehicle\'s lock/VIN if not.' },
      { name: 'Lost bike key', detail: 'Often re-cut directly from the ignition lock cylinder when no spare exists.' },
      { name: 'Lost home key (locked out)', detail: 'A locksmith can pick or bypass the lock, then cut a fresh key on the spot - or replace the lock if needed.' }
    ],
    steps: [
      'Confirm you\'re actually locked out (check for a hidden spare or a family member with a copy first).',
      'Search KeyShops.in for a nearby shop or locksmith, filtering by emergency/24-hour availability if needed.',
      'Verify your identity/ownership where required, especially for vehicle keys.',
      'The shop cuts (and programmes, if applicable) a new key, or gets you back into your home.'
    ],
    pricing: 'Lost home key/lockout: ₹150-₹500 · Lost bike key: ₹150-₹400 · Lost car key (no spare, cut from vehicle): ₹500-₹3,000',
    faq: [
      { q: 'What should I do first if I\'ve lost my only car key?', a: 'Check for a spare with family or the dealer first. If none exists, contact a nearby key shop or your dealer - a new key may need to be cut from the vehicle\'s lock or VIN, which costs more than a simple duplicate.' },
      { q: 'Is emergency lost-key service available at night?', a: 'Many locksmiths and key shops in larger cities offer 24/7 emergency service, usually at a premium of ₹100-₹300 above standard rates.' },
      { q: 'Do I need ID proof to get a replacement car key made?', a: 'Yes, most shops will ask for ID and proof of vehicle ownership before cutting a replacement key with no original present, to prevent unauthorized duplication.' }
    ]
  },
  'office-key-duplication': {
    title: 'Office & Commercial Key Duplication | Business Key Copying Services',
    description: 'Duplicate office, cabin, and commercial lock keys for your business at verified local key shops - including master-key and restricted systems.',
    intro: 'From a single cabin lock to a full office master-key system, KeyShops.in connects businesses with verified shops that handle commercial key duplication reliably and discreetly.',
    types: [
      { name: 'Standard office/cabin keys', detail: 'Duplicated the same way as home keys - fast, on-the-spot cutting for most commercial locks.' },
      { name: 'Master-key system keys', detail: 'Part of a hierarchical access system; duplication typically needs authorization from the office admin or facilities manager, and sometimes the original locksmith who set up the system.' },
      { name: 'Restricted/patented commercial keys', detail: 'Higher-security profiles often used for server rooms or storage - duplication requires proof of authorization.' }
    ],
    steps: [
      'Confirm whether the key is a standard lock or part of a master-key system (check with facilities/admin).',
      'Bring the original key and any required authorization to a shop experienced with commercial locks.',
      'The shop cuts the duplicate, verifying it against the correct blank and (for master systems) the access level.',
      'Test the key on-site and log the new copy per your office\'s key-control policy.'
    ],
    pricing: 'Standard office keys: ₹30-₹100 · Master-key system keys: ₹150-₹500 (subject to authorization)',
    faq: [
      { q: 'Can I duplicate an office master key without authorization?', a: 'Most shops will decline to duplicate keys stamped "Do Not Duplicate" or belonging to a known master-key system without written authorization from the business - this is a security safeguard, not a shop limitation.' },
      { q: 'How do I set up key control for a new office?', a: 'Work with a locksmith to install a master-key system with restricted blanks, then maintain a log of who holds which key - KeyShops.in can help you find a shop experienced in commercial master-key setups.' },
      { q: 'Is same-day duplication available for office keys?', a: 'Standard office keys are usually ready the same day; master-key system duplicates may take longer if authorization needs to be verified first.' }
    ]
  }
};

export default function ServicePage({ slug }) {
  const [expandedFaq, setExpandedFaq] = useState(null);
  const data = serviceData[slug] || serviceData['duplicate-car-keys'];

  useEffect(() => {
    window.scrollTo(0, 0);
    updateMetaTags(
      `${data.title} | KeyShops.in`,
      data.description,
      getCanonicalUrl(`/services/${slug}`),
      getOGImageUrl()
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return (
    <div className="bg-white">
      <script type="application/ld+json">
        {JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Service',
          name: data.title,
          description: data.description,
          url: `https://keyshops.in/services/${slug}`,
          provider: { '@type': 'Organization', name: 'KeyShops.in', url: 'https://keyshops.in' },
          areaServed: { '@type': 'Country', name: 'India' }
        })}
      </script>
      <script type="application/ld+json">
        {JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: data.faq.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a }
          }))
        })}
      </script>

      <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-4">{data.title}</h1>
          <p className="text-lg text-primary-100">{data.description}</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12">
        <section className="mb-12">
          <p className="text-lg text-gray-700">{data.intro}</p>
        </section>

        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Types of Keys We Cover</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {data.types.map((t, idx) => (
              <div key={idx} className="p-4 bg-blue-50 rounded-lg">
                <h3 className="font-bold text-gray-900 mb-1">{t.name}</h3>
                <p className="text-gray-700 text-sm">{t.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">How It Works</h2>
          <ol className="space-y-4">
            {data.steps.map((step, idx) => (
              <li key={idx} className="flex">
                <span className="font-bold text-primary-600 mr-4 text-lg">{idx + 1}.</span>
                <p className="text-gray-700">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mb-12 bg-green-50 border-l-4 border-green-500 p-8 rounded-lg">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Typical Pricing</h2>
          <p className="text-lg text-gray-700 font-semibold">{data.pricing}</p>
          <p className="text-gray-600 mt-4">Actual prices vary by shop, key complexity, and city. Use KeyShops.in to compare shops near you.</p>
        </section>

        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {data.faq.map((item, idx) => (
              <div key={idx} className="border border-gray-300 rounded-lg">
                <button
                  onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
                  className="w-full text-left px-6 py-4 flex justify-between items-center hover:bg-gray-50 font-semibold text-gray-900"
                >
                  {item.q}
                  {expandedFaq === idx ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
                {expandedFaq === idx && (
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-300 text-gray-700">{item.a}</div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="bg-primary-50 border-l-4 border-primary-500 p-8 rounded-lg text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Find a Verified Key Shop Near You</h2>
          <p className="text-gray-700 mb-6">Browse shops, compare prices, and get your key duplicated today.</p>
          <a href="/search?q=key+shops" className="inline-block bg-primary-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors">
            Search Key Shops
          </a>
        </section>
      </div>
    </div>
  );
}
