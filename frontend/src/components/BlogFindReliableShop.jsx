import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, CheckCircle } from 'lucide-react';
import { updateMetaTags, getCanonicalUrl, getOGImageUrl } from '../utils/seoHelpers';

export default function BlogFindReliableShop() {
  useEffect(() => {
    window.scrollTo(0, 0);
    updateMetaTags(
      'How to Find a Reliable Key Shop Near You | KeyShops.in',
      'A practical checklist for choosing a trustworthy key duplication shop - what to check, questions to ask, and red flags to avoid.',
      getCanonicalUrl('/blog/how-to-find-reliable-key-shop'),
      getOGImageUrl()
    );
  }, []);

  const [expandedFaq, setExpandedFaq] = useState(null);

  const checklist = [
    { title: 'Check reviews and ratings', detail: 'Look for shops with consistent positive feedback over time, not just a handful of reviews. Read a few recent ones for specifics, not just star counts.' },
    { title: 'Ask about warranty', detail: 'A shop confident in its work will offer some form of guarantee - typically 30 days - on duplicated keys that fail to work correctly.' },
    { title: 'Confirm they handle your key type', detail: 'Not every shop programs transponder or smart keys. Call ahead and describe your exact key/vehicle to avoid a wasted trip.' },
    { title: 'Compare at least two or three quotes', detail: 'Prices for the same key type can vary noticeably between shops in the same area - a quick call or two before committing is worth it.' },
    { title: 'Look for transparent, upfront pricing', detail: 'A reliable shop quotes a price before starting work, not after. Be cautious of shops that avoid giving a number until the key is already cut.' },
    { title: 'Verify ID requirements for security', detail: 'For vehicle keys made without an original present, a shop that asks for ID and proof of ownership is following good security practice, not being difficult.' }
  ];

  const redFlags = [
    'No fixed address or storefront - just a mobile number and a promise to "come to you"',
    'Reluctant to quote a price until after the work is done',
    'No willingness to redo a key that doesn\'t work',
    'Pressure to buy additional services (lock replacement, "premium" blanks) you didn\'t ask about',
    'Unable to answer basic questions about your specific key type'
  ];

  const faqItems = [
    { q: 'How do I know if a key shop is certified?', a: 'There\'s no single national certification for key shops in India, so look instead at track record: years in business, visible reviews, and willingness to answer questions about their equipment and process.' },
    { q: 'Should I choose the cheapest key shop?', a: 'Not automatically. A very low price with no warranty can end up costing more if the key fails. Compare price alongside warranty, reviews, and whether they handle your specific key type.' },
    { q: 'Is it safe to let a shop keep a copy of my key details?', a: 'A reliable shop only needs your key to cut a duplicate and shouldn\'t need to record or store details about your vehicle or home beyond what\'s required for the transaction.' },
    { q: 'What\'s the fastest way to compare shops near me?', a: 'Use KeyShops.in to browse verified shops by location, see their listed services and contact info, and compare before you travel to one.' }
  ];

  return (
    <article className="bg-white">
      <script type="application/ld+json">
        {JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqItems.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a }
          }))
        })}
      </script>

      <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-4">How to Find a Reliable Key Shop Near You</h1>
          <p className="text-lg text-primary-100">A practical checklist for choosing a trustworthy key duplication shop</p>
          <p className="text-sm text-primary-200 mt-4">Published: August 18, 2026</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12">
        <section className="mb-12">
          <p className="text-lg text-gray-700">
            Most key shops do honest, competent work — but with dozens of options in any city, it helps to
            know what separates a shop worth trusting from one to walk past. Here's what to actually check
            before you hand over your keys.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">What to Check Before You Choose a Shop</h2>
          <div className="space-y-4">
            {checklist.map((item, idx) => (
              <div key={idx} className="flex p-4 bg-blue-50 rounded-lg">
                <CheckCircle size={22} className="text-primary-600 mr-3 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">{item.title}</h3>
                  <p className="text-gray-700 text-sm">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12 bg-red-50 border-l-4 border-red-500 p-8 rounded-lg">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Red Flags to Watch For</h2>
          <ul className="space-y-2">
            {redFlags.map((flag, idx) => (
              <li key={idx} className="flex text-gray-700">
                <span className="text-red-600 mr-3">⚠</span>
                <span>{flag}</span>
              </li>
            ))}
          </ul>
        </section>

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
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-300 text-gray-700">{item.a}</div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="bg-primary-50 border-l-4 border-primary-500 p-8 rounded-lg text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Skip the Guesswork</h2>
          <p className="text-gray-700 mb-6">Browse verified key shops near you on KeyShops.in, with listed services and contact details up front.</p>
          <a href="/search?q=key+shops" className="inline-block bg-primary-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors">
            Search Key Shops
          </a>
        </section>

        <section className="mt-16 pt-12 border-t border-gray-300">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">Related Articles</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <a href="/blog/key-duplication-cost-guide" className="block p-6 border border-gray-300 rounded-lg hover:shadow-lg transition-shadow">
              <h4 className="font-bold text-gray-900 mb-2">Key Duplication Cost Guide 2025</h4>
              <p className="text-gray-700 text-sm">Complete cost breakdown for all types of keys</p>
            </a>
            <a href="/blog/lost-car-key-recovery-guide" className="block p-6 border border-gray-300 rounded-lg hover:shadow-lg transition-shadow">
              <h4 className="font-bold text-gray-900 mb-2">Lost Car Key Recovery Guide</h4>
              <p className="text-gray-700 text-sm">What to do the moment you realize your key is gone</p>
            </a>
          </div>
        </section>
      </div>
    </article>
  );
}
