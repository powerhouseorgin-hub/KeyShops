import React, { useEffect } from 'react';
import { ChevronDown, ChevronUp, MapPin, Phone, Clock, Star } from 'lucide-react';
import { useState } from 'react';
import { updateMetaTags, getCanonicalUrl, getOGImageUrl } from '../utils/seoHelpers';

// Map cities to their states
const cityToState = {
  'chennai': 'Tamil Nadu',
  'tamil-nadu': 'Tamil Nadu',
  'bangalore': 'Karnataka',
  'hyderabad': 'Telangana',
  'pune': 'Maharashtra',
  'mumbai': 'Maharashtra',
  'coimbatore': 'Tamil Nadu',
  'madurai': 'Tamil Nadu',
  'kochi': 'Kerala'
};

// Normalize city name for display
function normalizeCityName(city) {
  const map = {
    'tamil-nadu': 'Tamil Nadu',
    'chennai': 'Chennai',
    'bangalore': 'Bangalore',
    'hyderabad': 'Hyderabad',
    'pune': 'Pune',
    'mumbai': 'Mumbai',
    'coimbatore': 'Coimbatore',
    'madurai': 'Madurai',
    'kochi': 'Kochi'
  };
  return map[city.toLowerCase()] || city;
}

export default function LocationPage({ location = 'Chennai', state = 'Tamil Nadu' }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const [expandedFaq, setExpandedFaq] = useState(null);

  // Normalize location name for lookup
  const normalizedCity = normalizeCityName(location);
  const finalState = cityToState[location.toLowerCase()] || state;

  const locationData = {
    'Chennai': {
      title: 'Professional Key Shops & Duplication Services in Chennai, Tamil Nadu',
      description: 'Find verified key shops in Chennai for duplicate car keys, bike keys, home keys, and emergency key replacement services.',
      services: [
        'Car key duplication',
        'Bike key duplication',
        'Home & office key duplication',
        'Lost key replacement',
        'Smart key programming',
        'Emergency 24/7 services'
      ],
      areas: ['Mylapore', 'T. Nagar', 'Nungambakkam', 'Adyar', 'Kodambakkam', 'Ashok Nagar', 'Egmore', 'Purasawalkam'],
      avgCost: 'Mechanical: ₹50-150, Transponder: ₹200-500, Smart Keys: ₹500-2000',
      faq: [
        {
          q: 'Which key shops in Chennai are open 24/7?',
          a: 'Several key shops in central Chennai areas like T. Nagar and Mylapore offer 24/7 emergency services. Use KeyShops.in search to filter by availability.'
        },
        {
          q: 'How long does car key duplication take in Chennai?',
          a: 'Mechanical keys: 5-15 minutes. Transponder keys: 30-120 minutes. Most shops complete same-day service.'
        },
        {
          q: 'What\'s the cheapest place to duplicate car keys in Chennai?',
          a: 'Compare prices across multiple shops. Average cost for basic keys is ₹50-150. Use KeyShops.in to compare rates and reviews.'
        },
        {
          q: 'Can I get emergency key replacement in Chennai at night?',
          a: 'Yes, many shops and locksmiths offer 24/7 emergency services. Premium charges apply (₹100-300 extra).'
        }
      ]
    },
    'Bangalore': {
      title: 'Duplicate Key Services in Bangalore | Find Best Key Shops',
      description: 'Professional key duplication and key replacement services in Bangalore. Car keys, bike keys, home keys, and 24/7 emergency services.',
      services: [
        'Car key duplication & replacement',
        'Motorcycle key services',
        'Residential key duplication',
        'Commercial key services',
        'Electronic key programming',
        'Same-day services'
      ],
      areas: ['Indiranagar', 'Koramangala', 'Whitefield', 'MG Road', 'Jayanagar', 'Hebbal', 'BTM Layout'],
      avgCost: 'Mechanical: ₹60-160, Transponder: ₹250-550, Smart Keys: ₹600-2200',
      faq: [
        {
          q: 'Where can I find the best key shop in Bangalore?',
          a: 'Use KeyShops.in search filtered by Bangalore location. Check reviews, ratings, and certification status before visiting.'
        },
        {
          q: 'How much do key shops in Bangalore charge?',
          a: 'Mechanical keys: ₹60-160. Transponder: ₹250-550. Prices vary by shop and key complexity.'
        },
        {
          q: 'Is car key duplication legal in Bangalore?',
          a: 'Yes, duplicating your own keys is legal. You need to show ID proof at most shops.'
        },
        {
          q: 'Can I duplicate car keys without the original in Bangalore?',
          a: 'No, but authorized dealers can create new keys using your vehicle ID. This is more expensive (₹500-3000).'
        }
      ]
    },
    'Hyderabad': {
      title: 'Key Duplication Services in Hyderabad | Certified Key Shops',
      description: 'Find trusted key shops in Hyderabad for professional key duplication, replacement, and emergency services.',
      services: [
        'Duplicate car & bike keys',
        'Home security key solutions',
        'Office key management',
        'Smart key programming',
        'Emergency lockout services',
        'Quick turnaround services'
      ],
      areas: ['Himayatnagar', 'Secunderabad', 'HITEC City', 'Jubilee Hills', 'Kondapur', 'Banjara Hills'],
      avgCost: 'Mechanical: ₹55-145, Transponder: ₹220-480, Smart Keys: ₹550-1950',
      faq: [
        {
          q: 'What key shops in Hyderabad have good reviews?',
          a: 'Check KeyShops.in for certified shops with customer ratings and verified reviews in your area.'
        },
        {
          q: 'Average cost of key duplication in Hyderabad?',
          a: 'Basic keys: ₹55-145. Transponder: ₹220-480. Prices depend on key type and shop.'
        },
        {
          q: 'Do I need an appointment for key duplication in Hyderabad?',
          a: 'Most shops accept walk-in customers. Call ahead for same-day availability, especially for complex keys.'
        },
        {
          q: 'Can key shops in Hyderabad duplicate all types of car keys?',
          a: 'Most certified shops can handle mechanical and transponder keys. Smart keys usually need dealer service.'
        }
      ]
    },
    'Pune': {
      title: 'Key Duplication & Replacement Services in Pune, Maharashtra',
      description: 'Compare verified key shops in Pune for car, bike, home, and office key duplication, plus emergency lost-key replacement.',
      services: [
        'Car key duplication & replacement',
        'Bike & scooter key duplication',
        'Home & office key duplication',
        'Lost key replacement',
        'Transponder & remote key services',
        'Emergency lockout assistance'
      ],
      areas: ['Koregaon Park', 'Hinjewadi', 'Viman Nagar', 'Kothrud', 'Baner', 'Camp', 'Hadapsar', 'Aundh'],
      avgCost: 'Mechanical: ₹50-150, Transponder: ₹220-500, Smart Keys: ₹550-2000',
      faq: [
        {
          q: 'Where can I get a car key duplicated in Pune quickly?',
          a: 'Areas like Hinjewadi, Koregaon Park, and Camp have several key shops offering same-day mechanical and transponder key duplication. Use KeyShops.in to find one near you.'
        },
        {
          q: 'How much does key duplication cost in Pune?',
          a: 'Mechanical keys typically cost ₹50-150, transponder keys ₹220-500, and smart keys ₹550-2000, depending on the vehicle and shop.'
        },
        {
          q: 'Are there 24-hour key shops in Pune for emergencies?',
          a: 'Several shops near IT hubs like Hinjewadi and Viman Nagar offer extended or 24/7 emergency service; premium charges may apply outside normal hours.'
        },
        {
          q: 'Can I duplicate a smart key in Pune without visiting a dealer?',
          a: 'Some certified independent shops in Pune can programme aftermarket smart-key blanks, but availability depends on your vehicle\'s make and model — call ahead to confirm.'
        }
      ]
    },
    'Mumbai': {
      title: 'Duplicate Key Shops & Locksmith Services in Mumbai, Maharashtra',
      description: 'Find trusted key duplication shops across Mumbai for car, bike, home, and office keys, with same-day and emergency service options.',
      services: [
        'Car key duplication & replacement',
        'Bike & motorcycle key services',
        'Residential key duplication',
        'Commercial/office key services',
        'Smart key & remote programming',
        '24/7 emergency lockout services'
      ],
      areas: ['Andheri', 'Bandra', 'Borivali', 'Dadar', 'Thane', 'Powai', 'Malad', 'Chembur'],
      avgCost: 'Mechanical: ₹60-160, Transponder: ₹250-550, Smart Keys: ₹600-2200',
      faq: [
        {
          q: 'Which areas in Mumbai have the most key shops?',
          a: 'Andheri, Dadar, and Borivali have a high concentration of independent key shops and locksmiths. Search KeyShops.in by locality for the closest options.'
        },
        {
          q: 'What does key duplication typically cost in Mumbai?',
          a: 'Basic mechanical keys run ₹60-160, transponder keys ₹250-550, and smart/remote keys ₹600-2200, depending on vehicle and shop.'
        },
        {
          q: 'Can a Mumbai key shop help if I\'ve lost my only car key?',
          a: 'Yes — most shops can cut a new key from the vehicle\'s lock or ignition; for transponder/smart keys without an original, an authorized dealer visit is usually required and costs more.'
        },
        {
          q: 'Is home delivery or on-site key cutting available in Mumbai?',
          a: 'Some locksmiths in busy areas like Andheri and Powai offer on-site/mobile key-cutting for an added call-out fee — check individual shop listings for this option.'
        }
      ]
    },
    'Tamil Nadu': {
      title: 'Key Duplication Shops Across Tamil Nadu | Chennai, Coimbatore, Madurai & More',
      description: 'Browse verified key duplication and locksmith services across Tamil Nadu — compare shops in Chennai, Coimbatore, Madurai, and other major cities.',
      services: [
        'Car key duplication & replacement',
        'Bike key duplication',
        'Home & office key duplication',
        'Lost key replacement',
        'Transponder & smart key programming',
        'Emergency locksmith services'
      ],
      areas: ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Vellore', 'Erode', 'Tirunelveli'],
      avgCost: 'Mechanical: ₹50-150, Transponder: ₹200-500, Smart Keys: ₹500-2000',
      faq: [
        {
          q: 'Does KeyShops.in cover cities beyond Chennai in Tamil Nadu?',
          a: 'Yes — shops are listed across Tamil Nadu, including Coimbatore, Madurai, Tiruchirappalli, and other districts. Use the location filter to search a specific city.'
        },
        {
          q: 'Do key duplication prices vary much across Tamil Nadu?',
          a: 'Prices are broadly similar statewide — mechanical keys ₹50-150, transponder keys ₹200-500 — with slightly higher rates in larger cities like Chennai and Coimbatore.'
        },
        {
          q: 'How do I find a key shop in a smaller Tamil Nadu town?',
          a: 'Search KeyShops.in by district or town name; the directory includes shops beyond the major metros, and new listings are added regularly.'
        },
        {
          q: 'Are transponder and smart key services available outside Chennai?',
          a: 'Larger cities like Coimbatore and Madurai have shops offering transponder programming; smart key services are more limited outside metro areas — confirm availability before visiting.'
        }
      ]
    }
  };

  const data = locationData[normalizedCity] || locationData['Chennai'];

  useEffect(() => {
    updateMetaTags(
      `${data.title.replace('{location}', normalizedCity).replace('{state}', finalState)} | KeyShops.in`,
      data.description.replace('{location}', normalizedCity).replace('{state}', finalState),
      getCanonicalUrl(`/key-shops/${location.toLowerCase()}`),
      getOGImageUrl()
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedCity, finalState]);

  return (
    <div className="bg-white">
      {/* Schema Markup for LocalBusiness */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          "name": `KeyShops.in - ${normalizedCity}, ${finalState}`,
          "description": data.description,
          "url": `https://keyshops.in/key-shops/${location.toLowerCase()}`,
          "areaServed": {
            "@type": "City",
            "name": location,
            "addressRegion": state,
            "addressCountry": "IN"
          },
          "serviceType": data.services,
          "priceRange": data.avgCost
        })}
      </script>

      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-4">{data.title.replace('{location}', normalizedCity).replace('{state}', finalState)}</h1>
          <p className="text-lg text-primary-100">{data.description.replace('{location}', normalizedCity).replace('{state}', finalState)}</p>
          <p className="text-sm text-primary-200 mt-4">Published: August 18, 2026</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Services Overview */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Key Duplication Services in {normalizedCity}</h2>
          <div className="grid md:grid-cols-2 gap-4 mb-8">
            {data.services.map((service, idx) => (
              <div key={idx} className="flex items-start p-4 bg-blue-50 rounded-lg">
                <span className="text-primary-600 mr-3 mt-1">✓</span>
                <span className="text-gray-700">{service}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Service Areas */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Service Areas in {normalizedCity}</h2>
          <div className="grid md:grid-cols-3 gap-3">
            {data.areas.map((area, idx) => (
              <div key={idx} className="flex items-center p-3 bg-gray-100 rounded-lg">
                <MapPin size={18} className="text-primary-600 mr-2 flex-shrink-0" />
                <span className="text-gray-700">{area}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing Section */}
        <section className="mb-12 bg-green-50 border-l-4 border-green-500 p-8 rounded-lg">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Average Cost in {normalizedCity}</h2>
          <p className="text-lg text-gray-700 font-semibold">{data.avgCost}</p>
          <p className="text-gray-600 mt-4">
            Prices may vary based on key complexity, shop location, and certification level. Use KeyShops.in to compare rates from multiple shops in {normalizedCity}.
          </p>
        </section>

        {/* Why Choose Professional Shops */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Why Choose Professional Key Shops in {normalizedCity}?</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 border-l-4 border-blue-500 p-6">
              <h3 className="font-bold text-gray-900 mb-3">Quality & Reliability</h3>
              <p className="text-gray-700">Certified key shops use premium blanks and modern equipment, ensuring your keys work perfectly every time.</p>
            </div>
            <div className="bg-blue-50 border-l-4 border-blue-500 p-6">
              <h3 className="font-bold text-gray-900 mb-3">Fast Service</h3>
              <p className="text-gray-700">Most services completed same-day. Mechanical keys ready in minutes, transponder keys in 30-120 minutes.</p>
            </div>
            <div className="bg-blue-50 border-l-4 border-blue-500 p-6">
              <h3 className="font-bold text-gray-900 mb-3">Affordable Pricing</h3>
              <p className="text-gray-700">Significantly cheaper than authorized dealers. Transparent pricing with no hidden charges.</p>
            </div>
            <div className="bg-blue-50 border-l-4 border-blue-500 p-6">
              <h3 className="font-bold text-gray-900 mb-3">Warranty & Guarantee</h3>
              <p className="text-gray-700">Most certified shops offer 30-day warranty on all duplication work and customer satisfaction guarantee.</p>
            </div>
          </div>
        </section>

        {/* How to Find Best Shops */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">How to Find the Best Key Shop in {normalizedCity}</h2>
          <ol className="space-y-4 mb-8">
            <li className="flex">
              <span className="font-bold text-primary-600 mr-4 text-lg">1.</span>
              <div>
                <strong className="text-gray-900">Use KeyShops.in Search</strong>
                <p className="text-gray-700">Enter your city and service type to find nearby certified shops</p>
              </div>
            </li>
            <li className="flex">
              <span className="font-bold text-primary-600 mr-4 text-lg">2.</span>
              <div>
                <strong className="text-gray-900">Check Ratings & Reviews</strong>
                <p className="text-gray-700">Read verified customer reviews and check shop ratings</p>
              </div>
            </li>
            <li className="flex">
              <span className="font-bold text-primary-600 mr-4 text-lg">3.</span>
              <div>
                <strong className="text-gray-900">Verify Certification</strong>
                <p className="text-gray-700">Ensure shops are certified and use quality materials</p>
              </div>
            </li>
            <li className="flex">
              <span className="font-bold text-primary-600 mr-4 text-lg">4.</span>
              <div>
                <strong className="text-gray-900">Compare Prices</strong>
                <p className="text-gray-700">Call 2-3 shops and compare pricing for your specific key type</p>
              </div>
            </li>
            <li className="flex">
              <span className="font-bold text-primary-600 mr-4 text-lg">5.</span>
              <div>
                <strong className="text-gray-900">Ask About Warranty</strong>
                <p className="text-gray-700">Confirm they offer warranty on their work</p>
              </div>
            </li>
          </ol>
        </section>

        {/* FAQ */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Frequently Asked Questions about {normalizedCity}</h2>
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
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-300 text-gray-700">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-primary-50 border-l-4 border-primary-500 p-8 rounded-lg text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Find Key Shops Near You in {normalizedCity}</h2>
          <p className="text-gray-700 mb-6">Browse verified key shops, compare prices, read reviews, and book your service today.</p>
          <a href="/search?q=key+shops" className="inline-block bg-primary-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors">
            Search Key Shops in {normalizedCity}
          </a>
        </section>

        {/* Related Articles */}
        <section className="mt-16 pt-12 border-t border-gray-300">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">Related Articles</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <a href="/blog/key-duplication-cost-guide" className="block p-6 border border-gray-300 rounded-lg hover:shadow-lg transition-shadow">
              <h4 className="font-bold text-gray-900 mb-2">Key Duplication Cost Guide 2025</h4>
              <p className="text-gray-700 text-sm">Complete cost breakdown for all types of keys</p>
            </a>
            <a href="/blog/car-key-duplication-guide" className="block p-6 border border-gray-300 rounded-lg hover:shadow-lg transition-shadow">
              <h4 className="font-bold text-gray-900 mb-2">Car Key Duplication Guide</h4>
              <p className="text-gray-700 text-sm">Everything about duplicating car keys</p>
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
