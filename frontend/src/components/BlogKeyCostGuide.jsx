import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function BlogKeyCostGuide() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const [expandedFaq, setExpandedFaq] = useState(null);

  const costTable = [
    { type: 'Mechanical Keys', cost: '₹50-₹100', time: '5-15 min', quality: 'Standard' },
    { type: 'Brass/High-quality', cost: '₹150-₹200', time: '10-20 min', quality: 'Premium' },
    { type: 'Basic Transponder', cost: '₹250-₹400', time: '30-60 min', quality: 'Standard' },
    { type: 'Advanced Transponder', cost: '₹400-₹600', time: '60-120 min', quality: 'Premium' },
    { type: 'Remote Key Fob', cost: '₹300-₹500', time: '30-60 min', quality: 'Standard' },
    { type: 'Smart Key', cost: '₹1,000-₹2,000', time: '24-72 hours', quality: 'Premium' },
  ];

  const faqItems = [
    {
      q: 'How much does it cost to duplicate a car key?',
      a: 'Car key duplication costs ₹50-₹150 for mechanical keys, ₹200-₹500 for transponder keys, and ₹500-₹2,000 for smart keys. Costs vary by car make, complexity, and location.'
    },
    {
      q: 'How long does key duplication take?',
      a: 'Mechanical keys: 5-15 minutes. Transponder keys: 30 minutes to 2 hours. Smart keys: 24-72 hours at authorized dealers.'
    },
    {
      q: 'Can I duplicate my key without the original?',
      a: 'No, you need the original key. However, authorized dealers can create new keys using your VIN if the original is lost. This is more expensive (₹500-₹3,000).'
    },
    {
      q: 'Where can I get my key duplicated near me?',
      a: 'Use KeyShops.in to find certified key shops near you, contact authorized car dealers, or call local locksmiths for emergency services.'
    },
    {
      q: 'Is it safe to duplicate keys at local key shops?',
      a: 'Yes, if they\'re certified and experienced. Always verify they use quality blanks, provide warranty, and have positive reviews.'
    },
  ];

  return (
    <article className="bg-white">
      {/* Schema Markup for FAQ */}
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

      {/* Article Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-4">Key Duplication Cost Guide 2025: How Much Should You Pay?</h1>
          <p className="text-lg text-primary-100">Complete breakdown of key duplication costs by type, city, and service</p>
          <p className="text-sm text-primary-200 mt-4">Published: August 18, 2026 | Updated: August 18, 2026</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Introduction */}
        <section className="mb-12">
          <p className="text-lg text-gray-700 mb-4">
            Whether you've lost your key or need a spare, understanding key duplication costs is essential. KeyShops.in breaks down the complete pricing for all types of keys—from mechanical to smart keys—and shows you how to get the best deal.
          </p>
        </section>

        {/* Factors Affecting Cost */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Factors Affecting Key Duplication Cost</h2>
          <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-6">
            <ul className="space-y-3 text-gray-700">
              <li><strong>Key Type:</strong> Mechanical vs. transponder vs. smart keys have vastly different costs</li>
              <li><strong>Car Make and Model:</strong> Premium brands cost more to duplicate</li>
              <li><strong>Key Complexity:</strong> More intricate keys require specialized equipment</li>
              <li><strong>Location:</strong> Urban areas typically charge more than rural regions</li>
              <li><strong>Urgency:</strong> Same-day or emergency services cost 20-50% extra</li>
              <li><strong>Shop Reputation:</strong> Certified shops charge more but guarantee quality</li>
            </ul>
          </div>
        </section>

        {/* Cost Breakdown Table */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Detailed Cost Breakdown by Key Type</h2>
          <div className="overflow-x-auto mb-6">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-4 py-3 text-left font-bold">Key Type</th>
                  <th className="border border-gray-300 px-4 py-3 text-left font-bold">Cost Range</th>
                  <th className="border border-gray-300 px-4 py-3 text-left font-bold">Time Required</th>
                  <th className="border border-gray-300 px-4 py-3 text-left font-bold">Quality</th>
                </tr>
              </thead>
              <tbody>
                {costTable.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="border border-gray-300 px-4 py-3">{row.type}</td>
                    <td className="border border-gray-300 px-4 py-3 font-semibold text-green-600">{row.cost}</td>
                    <td className="border border-gray-300 px-4 py-3">{row.time}</td>
                    <td className="border border-gray-300 px-4 py-3">
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        row.quality === 'Premium' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {row.quality}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Money-Saving Tips */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Money-Saving Tips</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-green-50 border-l-4 border-green-500 p-6">
              <h3 className="font-bold text-lg text-gray-900 mb-3">✓ Get Duplicates Early</h3>
              <p className="text-gray-700">Make spare keys while you still have both originals—it's much cheaper than emergency replacement.</p>
            </div>
            <div className="bg-green-50 border-l-4 border-green-500 p-6">
              <h3 className="font-bold text-lg text-gray-900 mb-3">✓ Bulk Discounts</h3>
              <p className="text-gray-700">Buy multiple copies at once. Most shops offer 20-30% discounts for 3+ keys.</p>
            </div>
            <div className="bg-green-50 border-l-4 border-green-500 p-6">
              <h3 className="font-bold text-lg text-gray-900 mb-3">✓ Avoid Rush Fees</h3>
              <p className="text-gray-700">Same-day emergency services cost 2-3x more. Plan ahead when possible.</p>
            </div>
            <div className="bg-green-50 border-l-4 border-green-500 p-6">
              <h3 className="font-bold text-lg text-gray-900 mb-3">✓ Compare Prices</h3>
              <p className="text-gray-700">Call 2-3 local key shops. Prices can vary by ₹100-₹300 for the same key.</p>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h2>
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

        {/* CTA Section */}
        <section className="bg-primary-50 border-l-4 border-primary-500 p-8 rounded-lg text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Ready to Get Your Key Duplicated?</h2>
          <p className="text-gray-700 mb-6">Use KeyShops.in to find verified, certified key shops near you with transparent pricing and customer reviews.</p>
          <a href="/search" className="inline-block bg-primary-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors">
            Find Key Shops Near You
          </a>
        </section>

        {/* Related Articles */}
        <section className="mt-16 pt-12 border-t border-gray-300">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">Related Articles</h3>
          <div className="grid md:grid-cols-3 gap-6">
            <a href="/blog/car-key-duplication-guide" className="block p-6 border border-gray-300 rounded-lg hover:shadow-lg transition-shadow">
              <h4 className="font-bold text-gray-900 mb-2">Car Key Duplication Guide</h4>
              <p className="text-gray-700 text-sm">Complete guide to duplicating car keys, types, and processes.</p>
            </a>
            <a href="/blog/how-to-find-reliable-key-shop" className="block p-6 border border-gray-300 rounded-lg hover:shadow-lg transition-shadow">
              <h4 className="font-bold text-gray-900 mb-2">How to Find a Reliable Key Shop</h4>
              <p className="text-gray-700 text-sm">Tips for choosing the best key shop near you with verified credentials.</p>
            </a>
            <a href="/blog/lost-car-key-recovery-guide" className="block p-6 border border-gray-300 rounded-lg hover:shadow-lg transition-shadow">
              <h4 className="font-bold text-gray-900 mb-2">Lost Car Key Recovery Guide</h4>
              <p className="text-gray-700 text-sm">Step-by-step guide when you've lost your car key.</p>
            </a>
          </div>
        </section>
      </div>
    </article>
  );
}
