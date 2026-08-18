import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { updateMetaTags, getCanonicalUrl, getOGImageUrl } from '../utils/seoHelpers';

export default function BlogCarKeyGuide() {
  useEffect(() => {
    window.scrollTo(0, 0);
    updateMetaTags(
      'Complete Guide to Car Key Duplication: Costs, Methods & Tips | KeyShops.in',
      'Everything you need to know about duplicating a car key - mechanical, transponder, and smart key methods, costs, and how to choose a shop.',
      getCanonicalUrl('/blog/car-key-duplication-guide'),
      getOGImageUrl()
    );
  }, []);

  const [expandedFaq, setExpandedFaq] = useState(null);

  const keyTypesTable = [
    {
      type: 'Mechanical Keys',
      description: 'Simple metal keys, easiest to duplicate',
      cost: '₹50-₹150',
      time: '5-15 min',
      complexity: 'Easy'
    },
    {
      type: 'Transponder Keys',
      description: 'Electronic chip inside, most cars 1995+',
      cost: '₹250-₹500',
      time: '30-120 min',
      complexity: 'Medium'
    },
    {
      type: 'Smart/Keyless Keys',
      description: 'Remote entry, proximity sensors',
      cost: '₹500-₹2,000',
      time: '24-72 hours',
      complexity: 'Hard'
    }
  ];

  const faqItems = [
    {
      q: 'How much does it cost to duplicate a car key?',
      a: 'Cost ranges from ₹50-₹150 for mechanical keys, ₹200-₹500 for transponder keys, and ₹500-₹2,000 for smart keys.'
    },
    {
      q: 'Can I duplicate my car key without the original?',
      a: 'No, you need the original key. For lost keys, contact authorized dealers (more expensive: ₹500-₹3,000).'
    },
    {
      q: 'How long does car key duplication take?',
      a: 'Mechanical: 5-15 minutes. Transponder: 30-120 minutes. Smart keys: 1-3 days at dealers.'
    },
    {
      q: 'Where is the safest place to duplicate my car key?',
      a: 'Certified key shops with good reviews, or authorized car dealerships if you want maximum compatibility assurance.'
    },
    {
      q: 'Is it safe to duplicate car keys at local key shops?',
      a: 'Yes, if they\'re certified and experienced. Check for reviews, warranty, and quality assurance.'
    }
  ];

  return (
    <article className="bg-white">
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": faqItems.map(item => ({
            "@type": "Question",
            "name": item.q,
            "acceptedAnswer": {
              "@type": "Answer",
              "text": item.a
            }
          }))
        })}
      </script>

      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-4">Complete Guide to Car Key Duplication: Costs, Methods & Tips</h1>
          <p className="text-lg text-blue-100">Everything you need to know about duplicating car keys</p>
          <p className="text-sm text-blue-200 mt-4">Published: August 18, 2026</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Introduction */}
        <section className="mb-12">
          <p className="text-lg text-gray-700 mb-4">
            Lost your car key? Need a spare? This comprehensive guide covers everything about car key duplication—types of keys, costs, methods, where to get them duplicated, and expert tips to save money.
          </p>
        </section>

        {/* What is Car Key Duplication */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">1. What is Car Key Duplication and When Do You Need It?</h2>

          <h3 className="text-xl font-bold text-gray-900 mb-3">Understanding Car Key Duplication</h3>
          <p className="text-gray-700 mb-6">
            Car key duplication is creating an exact copy of your original car key. It's a straightforward process for mechanical keys but more complex for electronic keys with transponder chips or smart key technology.
          </p>

          <h3 className="text-xl font-bold text-gray-900 mb-3">When You Need Car Key Duplication</h3>
          <ul className="space-y-2 text-gray-700 mb-6 list-disc list-inside">
            <li>You lost your only copy</li>
            <li>Need a spare for family members or household</li>
            <li>Original key is damaged or worn out</li>
            <li>Professional maintenance or replacement</li>
            <li>Peace of mind—having a backup is always smart</li>
          </ul>
        </section>

        {/* Types of Car Keys */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">2. Types of Car Keys and Their Duplication Complexity</h2>

          <div className="overflow-x-auto mb-8">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-4 py-3 text-left font-bold">Key Type</th>
                  <th className="border border-gray-300 px-4 py-3 text-left font-bold">Description</th>
                  <th className="border border-gray-300 px-4 py-3 text-left font-bold">Cost</th>
                  <th className="border border-gray-300 px-4 py-3 text-left font-bold">Time</th>
                </tr>
              </thead>
              <tbody>
                {keyTypesTable.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="border border-gray-300 px-4 py-3 font-semibold">{row.type}</td>
                    <td className="border border-gray-300 px-4 py-3">{row.description}</td>
                    <td className="border border-gray-300 px-4 py-3 text-green-600 font-semibold">{row.cost}</td>
                    <td className="border border-gray-300 px-4 py-3">{row.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-6 mb-6">
            <h4 className="font-bold text-lg text-gray-900 mb-3">Important: Cannot Duplicate Smart Keys at Local Key Shops</h4>
            <p className="text-gray-700">
              Smart keys with electronic remotes and keyless entry cannot be duplicated at regular key shops. Only authorized car dealerships have the specialized equipment and access to manufacturer systems needed.
            </p>
          </div>
        </section>

        {/* How the Process Works */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">3. How Car Key Duplication Process Works</h2>

          <h3 className="text-xl font-bold text-gray-900 mb-4">For Mechanical Keys (Step-by-Step)</h3>
          <ol className="space-y-4 mb-8 text-gray-700">
            <li className="flex"><span className="font-bold mr-3 text-blue-600">1.</span> <span><strong>Key Examination:</strong> Technician checks the original key's condition and specifications (5 minutes)</span></li>
            <li className="flex"><span className="font-bold mr-3 text-blue-600">2.</span> <span><strong>Blank Selection:</strong> Choose the correct blank that matches your key's profile</span></li>
            <li className="flex"><span className="font-bold mr-3 text-blue-600">3.</span> <span><strong>Key Cutting:</strong> Use precision key cutting machine to cut grooves matching original</span></li>
            <li className="flex"><span className="font-bold mr-3 text-blue-600">4.</span> <span><strong>Testing:</strong> Test new key in your car lock to ensure perfect fit</span></li>
            <li className="flex"><span className="font-bold mr-3 text-blue-600">5.</span> <span><strong>Quality Check:</strong> Final verification that key works smoothly</span></li>
          </ol>
          <p className="text-gray-700 mb-8"><strong>Total Time:</strong> 10-15 minutes</p>

          <h3 className="text-xl font-bold text-gray-900 mb-4">For Transponder Keys (Step-by-Step)</h3>
          <ol className="space-y-4 mb-8 text-gray-700">
            <li className="flex"><span className="font-bold mr-3 text-blue-600">1.</span> <span><strong>Key Evaluation:</strong> Read the chip information and car's key compatibility</span></li>
            <li className="flex"><span className="font-bold mr-3 text-blue-600">2.</span> <span><strong>Blank Selection:</strong> Choose appropriate blank with compatible chip slot</span></li>
            <li className="flex"><span className="font-bold mr-3 text-blue-600">3.</span> <span><strong>Mechanical Cutting:</strong> Cut the physical key part</span></li>
            <li className="flex"><span className="font-bold mr-3 text-blue-600">4.</span> <span><strong>Chip Programming:</strong> Program the transponder chip to match your car</span></li>
            <li className="flex"><span className="font-bold mr-3 text-blue-600">5.</span> <span><strong>Testing:</strong> Test both mechanical function and electronic chip</span></li>
            <li className="flex"><span className="font-bold mr-3 text-blue-600">6.</span> <span><strong>Final Verification:</strong> Ensure car recognizes the new key</span></li>
          </ol>
          <p className="text-gray-700 mb-8"><strong>Total Time:</strong> 30 minutes to 2 hours</p>
        </section>

        {/* Cost Breakdown */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">4. Complete Cost Breakdown</h2>

          <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-6">
            <h3 className="font-bold text-lg text-gray-900 mb-3">Factors Affecting Cost</h3>
            <ul className="space-y-2 text-gray-700 list-disc list-inside">
              <li><strong>Key Type:</strong> Mechanical vs. transponder vs. smart</li>
              <li><strong>Car Model:</strong> Premium brands cost more</li>
              <li><strong>Key Complexity:</strong> More intricate patterns cost more</li>
              <li><strong>Programming:</strong> Electronic keys require programming charges</li>
              <li><strong>Location:</strong> Urban areas typically cost more</li>
              <li><strong>Urgency:</strong> Same-day service costs 20-50% extra</li>
              <li><strong>Shop Reputation:</strong> Certified shops charge premium</li>
            </ul>
          </div>

          <h3 className="text-xl font-bold text-gray-900 mb-4">Money-Saving Tips</h3>
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <p className="text-gray-700"><strong>💡 Tip:</strong> Get duplicates made while you have both keys—much cheaper than emergency replacement</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <p className="text-gray-700"><strong>💡 Tip:</strong> Buy multiple copies at once—most shops offer 20-30% discounts</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <p className="text-gray-700"><strong>💡 Tip:</strong> Compare prices at 2-3 shops—costs can vary ₹100-300</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <p className="text-gray-700"><strong>💡 Tip:</strong> Avoid emergency/same-day services—they cost 2-3x more</p>
            </div>
          </div>
        </section>

        {/* Where to Get Keys Duplicated */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">5. Where to Get Your Car Keys Duplicated</h2>

          <div className="space-y-6">
            <div className="border border-gray-300 rounded-lg p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Authorized Car Dealerships</h3>
              <ul className="space-y-2 text-gray-700">
                <li><strong>Cost:</strong> ₹500-₹2,500 (2-3x higher)</li>
                <li><strong>Time:</strong> 24-72 hours</li>
                <li><strong>Best for:</strong> Smart keys, warranty coverage</li>
                <li><strong>Pros:</strong> Official, guaranteed compatibility, warranty</li>
              </ul>
            </div>

            <div className="border border-gray-300 rounded-lg p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Certified Key Shops</h3>
              <ul className="space-y-2 text-gray-700">
                <li><strong>Cost:</strong> ₹50-₹500 (50-70% cheaper than dealers)</li>
                <li><strong>Time:</strong> 30 minutes to 2 hours</li>
                <li><strong>Best for:</strong> Mechanical and transponder keys</li>
                <li><strong>Pros:</strong> Affordable, quick, experienced technicians</li>
              </ul>
            </div>

            <div className="border border-gray-300 rounded-lg p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Locksmith Services</h3>
              <ul className="space-y-2 text-gray-700">
                <li><strong>Cost:</strong> ₹200-₹1,500 (premium pricing)</li>
                <li><strong>Time:</strong> Same-day usually</li>
                <li><strong>Best for:</strong> Emergency/urgent situations</li>
                <li><strong>Pros:</strong> Mobile service, 24/7 availability</li>
              </ul>
            </div>

            <div className="border border-gray-300 rounded-lg p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Hardware Stores</h3>
              <ul className="space-y-2 text-gray-700">
                <li><strong>Cost:</strong> ₹50-₹100 (cheapest)</li>
                <li><strong>Time:</strong> Usually immediate</li>
                <li><strong>Best for:</strong> Basic mechanical keys only</li>
                <li><strong>Pros:</strong> Convenient, very affordable</li>
              </ul>
            </div>
          </div>
        </section>

        {/* DIY vs Professional */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">6. DIY vs. Professional Duplication</h2>

          <div className="bg-red-50 border-l-4 border-red-500 p-6 mb-6">
            <h3 className="font-bold text-lg text-gray-900 mb-3">Why DIY is Usually NOT Recommended</h3>
            <ul className="space-y-2 text-gray-700 list-disc list-inside">
              <li>Requires expensive equipment (key cutting machine ₹50,000+)</li>
              <li>Needs expertise to program transponder chips</li>
              <li>High risk of damaging original key</li>
              <li>Cannot handle smart keys</li>
              <li>Time-consuming and frustrating</li>
            </ul>
          </div>

          <div className="bg-green-50 border-l-4 border-green-500 p-6">
            <h3 className="font-bold text-lg text-gray-900 mb-3">Why Professional Duplication is Worth It</h3>
            <ul className="space-y-2 text-gray-700 list-disc list-inside">
              <li>Fast—10 minutes to 2 hours depending on key type</li>
              <li>Guaranteed accuracy and quality</li>
              <li>Warranty on work (usually 30 days)</li>
              <li>Peace of mind—professional assessment of issues</li>
              <li>Uses proper equipment and techniques</li>
            </ul>
          </div>
        </section>

        {/* Troubleshooting */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">7. Troubleshooting: What If Your Key Doesn't Work?</h2>

          <div className="space-y-4">
            <div className="border-l-4 border-yellow-500 bg-yellow-50 p-4">
              <p className="text-gray-700"><strong>Key doesn't fit in lock?</strong> Wrong blank was selected. Request re-cutting with correct blank at no extra charge.</p>
            </div>
            <div className="border-l-4 border-yellow-500 bg-yellow-50 p-4">
              <p className="text-gray-700"><strong>Key fits but doesn't turn?</strong> Cutting depth is incorrect. Request adjustment.</p>
            </div>
            <div className="border-l-4 border-yellow-500 bg-yellow-50 p-4">
              <p className="text-gray-700"><strong>Transponder works but car doesn't recognize it?</strong> Programming error. Request re-programming.</p>
            </div>
            <div className="border-l-4 border-yellow-500 bg-yellow-50 p-4">
              <p className="text-gray-700"><strong>Key feels loose or low-quality?</strong> Low-quality blank used. Request better grade or refund.</p>
            </div>
          </div>
        </section>

        {/* Prevention Tips */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">8. Tips to Prevent Key Loss and Damage</h2>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-6 rounded-lg">
              <h4 className="font-bold text-gray-900 mb-3">Key Maintenance</h4>
              <ul className="space-y-2 text-gray-700 text-sm list-disc list-inside">
                <li>Keep keys in protective sleeve</li>
                <li>Avoid dropping on hard surfaces</li>
                <li>Don't force keys in locks</li>
                <li>Clean keys regularly</li>
                <li>Store in dry location</li>
                <li>Separate car, home, office keys</li>
              </ul>
            </div>
            <div className="bg-blue-50 p-6 rounded-lg">
              <h4 className="font-bold text-gray-900 mb-3">Prevention Strategies</h4>
              <ul className="space-y-2 text-gray-700 text-sm list-disc list-inside">
                <li>Get spare key immediately</li>
                <li>Keep spare with trusted family</li>
                <li>Use key finder tags (AirTag/Tile)</li>
                <li>Save key shop location (KeyShops.in)</li>
                <li>Photograph your key</li>
                <li>Know your car's key code</li>
              </ul>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">9. Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqItems.map((item, idx) => (
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
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Need Your Car Key Duplicated?</h2>
          <p className="text-gray-700 mb-6">Find certified key shops near you with verified reviews, transparent pricing, and expert technicians.</p>
          <a href="/search" className="inline-block bg-primary-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors">
            Search Key Shops Now
          </a>
        </section>

        {/* Related Articles */}
        <section className="mt-16 pt-12 border-t border-gray-300">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">Related Articles</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <a href="/blog/key-duplication-cost-guide" className="block p-6 border border-gray-300 rounded-lg hover:shadow-lg transition-shadow">
              <h4 className="font-bold text-gray-900 mb-2">Key Duplication Cost Guide</h4>
              <p className="text-gray-700 text-sm">Complete breakdown of costs for all types of keys.</p>
            </a>
            <a href="/blog/lost-car-key-recovery-guide" className="block p-6 border border-gray-300 rounded-lg hover:shadow-lg transition-shadow">
              <h4 className="font-bold text-gray-900 mb-2">Lost Car Key Recovery Guide</h4>
              <p className="text-gray-700 text-sm">What to do when you've lost your car key.</p>
            </a>
          </div>
        </section>
      </div>
    </article>
  );
}
