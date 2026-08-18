import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { updateMetaTags, getCanonicalUrl, getOGImageUrl } from '../utils/seoHelpers';

export default function BlogBikeKeyGuide() {
  useEffect(() => {
    window.scrollTo(0, 0);
    updateMetaTags(
      'Bike Key Duplication Guide: Types, Process & Cost | KeyShops.in',
      'Everything about duplicating motorcycle and scooter keys - mechanical vs transponder types, the duplication process, costs, and what to do if you lose your only key.',
      getCanonicalUrl('/blog/bike-key-duplication-guide'),
      getOGImageUrl()
    );
  }, []);

  const [expandedFaq, setExpandedFaq] = useState(null);

  const keyTypes = [
    { name: 'Mechanical blade keys', detail: 'The standard key on most scooters and older/entry-level motorcycles - a metal blade cut to match your ignition and fuel-cap locks.' },
    { name: 'Transponder-chip keys', detail: 'Found on newer motorcycles with an electronic immobiliser; the key contains a chip the bike\'s ECU must recognise before it will start.' },
    { name: 'Remote-flip keys', detail: 'Combine a folding mechanical blade with a small remote for alarm/immobiliser control, common on premium motorcycles.' }
  ];

  const process = [
    'Take your working key (and the bike, if possible) to a key shop experienced with two-wheelers.',
    'The shop identifies the correct blank for your bike\'s make, model, and year.',
    'For mechanical keys, the blank is cut directly from your original on a key-cutting machine.',
    'For transponder keys, the new key also needs to be programmed to your bike\'s immobiliser system.',
    'Test the ignition, fuel cap, and any remote functions before leaving the shop.'
  ];

  const faqItems = [
    { q: 'How much does bike key duplication cost?', a: 'Mechanical keys typically cost ₹40-₹100. Transponder-chip keys for newer motorcycles run ₹150-₹350, depending on the brand and programming complexity.' },
    { q: 'How long does it take to duplicate a bike key?', a: 'Mechanical keys are usually ready in under 15 minutes. Transponder keys can take 30-60 minutes if the shop has the right programming equipment for your bike\'s brand.' },
    { q: 'Can any key shop duplicate a motorcycle key, or do I need the dealer?', a: 'Most independent key shops handle mechanical bike keys directly. Transponder-equipped models sometimes need brand-specific programming equipment, which not every shop carries - call ahead to confirm.' },
    { q: 'What if I\'ve lost my only bike key?', a: 'A locksmith can often cut a fresh key by decoding the ignition lock cylinder directly. For transponder-equipped bikes with no spare, this may require dealer-level programming tools.' },
    { q: 'Do I need to bring the bike itself, or just the key?', a: 'For a straightforward duplicate, the original key alone is usually enough. If your only key is lost, the shop will need access to the bike\'s lock to cut a new one.' }
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
          <h1 className="text-4xl font-bold mb-4">Bike Key Duplication Guide: Types, Process & Cost</h1>
          <p className="text-lg text-primary-100">Everything you need to know about duplicating a motorcycle or scooter key</p>
          <p className="text-sm text-primary-200 mt-4">Published: August 18, 2026</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12">
        <section className="mb-12">
          <p className="text-lg text-gray-700">
            A spare bike key is cheap insurance against being stranded. Here's what type of key your
            two-wheeler likely uses, how the duplication process works, and what it typically costs.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Types of Bike Keys</h2>
          <div className="grid md:grid-cols-1 gap-4">
            {keyTypes.map((t, idx) => (
              <div key={idx} className="p-4 bg-blue-50 rounded-lg">
                <h3 className="font-bold text-gray-900 mb-1">{t.name}</h3>
                <p className="text-gray-700 text-sm">{t.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">The Duplication Process</h2>
          <ol className="space-y-4">
            {process.map((step, idx) => (
              <li key={idx} className="flex">
                <span className="font-bold text-primary-600 mr-4 text-lg">{idx + 1}.</span>
                <p className="text-gray-700">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mb-12 bg-green-50 border-l-4 border-green-500 p-8 rounded-lg">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Typical Cost</h2>
          <p className="text-lg text-gray-700 font-semibold">Mechanical: ₹40-₹100 · Transponder-chip: ₹150-₹350</p>
          <p className="text-gray-600 mt-4">Prices vary by bike brand, key complexity, and shop location. Compare a couple of shops before committing, especially for transponder keys.</p>
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
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Find a Shop That Handles Bike Keys</h2>
          <p className="text-gray-700 mb-6">Browse verified key shops offering motorcycle and scooter key duplication near you.</p>
          <a href="/services/duplicate-bike-keys" className="inline-block bg-primary-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors">
            Bike Key Duplication Services
          </a>
        </section>

        <section className="mt-16 pt-12 border-t border-gray-300">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">Related Articles</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <a href="/blog/key-duplication-cost-guide" className="block p-6 border border-gray-300 rounded-lg hover:shadow-lg transition-shadow">
              <h4 className="font-bold text-gray-900 mb-2">Key Duplication Cost Guide 2025</h4>
              <p className="text-gray-700 text-sm">Complete cost breakdown for all types of keys</p>
            </a>
            <a href="/blog/how-to-find-reliable-key-shop" className="block p-6 border border-gray-300 rounded-lg hover:shadow-lg transition-shadow">
              <h4 className="font-bold text-gray-900 mb-2">How to Find a Reliable Key Shop</h4>
              <p className="text-gray-700 text-sm">A checklist for choosing a trustworthy shop</p>
            </a>
          </div>
        </section>
      </div>
    </article>
  );
}
