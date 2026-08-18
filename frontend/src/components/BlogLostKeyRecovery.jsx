import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { updateMetaTags, getCanonicalUrl, getOGImageUrl } from '../utils/seoHelpers';

export default function BlogLostKeyRecovery() {
  useEffect(() => {
    window.scrollTo(0, 0);
    updateMetaTags(
      'Lost Car Key Recovery Guide: What to Do Next | KeyShops.in',
      'Lost your only car key? Step-by-step guide covering immediate steps, what a locksmith or dealer needs, costs, and how to prevent it happening again.',
      getCanonicalUrl('/blog/lost-car-key-recovery-guide'),
      getOGImageUrl()
    );
  }, []);

  const [expandedFaq, setExpandedFaq] = useState(null);

  const immediateSteps = [
    { title: 'Retrace your last few hours', detail: 'Most "lost" keys are misplaced, not gone - check pockets, bags, and the last few places you used the car before assuming the worst.' },
    { title: 'Check for an existing spare', detail: 'A family member, roommate, or the original dealer may already hold a spare key, which is far cheaper to duplicate than cutting a new one.' },
    { title: 'Confirm the car is secure', detail: 'If the key is truly lost (not just misplaced), consider whether the car needs to be moved somewhere safer until a replacement is sorted.' },
    { title: 'Gather your documents', detail: 'Have your vehicle registration (RC) and a government ID ready — both a locksmith and an authorized dealer will need proof of ownership before cutting a key with no original present.' }
  ];

  const options = [
    { name: 'Independent key shop / locksmith', detail: 'Can often cut a new mechanical key directly from the door or ignition lock, and in many cases programme a basic transponder key too. Usually the fastest and cheapest route.' },
    { name: 'Authorized dealer', detail: 'Required for smart keys or when no lock-based cutting is possible - the dealer generates a key from your vehicle\'s VIN and dealer records. Slower and more expensive, but necessary for some models.' },
    { name: 'Roadside assistance / insurance cover', detail: 'Some vehicle insurance and roadside assistance plans include lost-key cover - worth checking before paying out of pocket.' }
  ];

  const faqItems = [
    { q: 'How much does it cost to replace a lost car key with no spare?', a: 'Cutting a mechanical key from the lock typically costs ₹500-₹1,200; a transponder or smart key cut and programmed from the VIN can run ₹1,500-₹3,000 or more depending on the vehicle.' },
    { q: 'Can a locksmith make a key without the original?', a: 'For many vehicles, yes — a locksmith can cut a mechanical key by reading the lock cylinder (a process called "impressioning" or lock decoding), and some can programme transponder chips on-site. Smart keys usually require dealer-level equipment.' },
    { q: 'What documents do I need to get a replacement car key?', a: 'Bring your vehicle registration certificate (RC) and a government-issued photo ID. Some dealers may also ask for the vehicle\'s chassis/engine number.' },
    { q: 'How can I avoid this happening again?', a: 'Keep a spare key at home or with a trusted family member, and consider a key-finder tag for keys you carry daily.' }
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
          <h1 className="text-4xl font-bold mb-4">Lost Car Key Recovery Guide: What to Do Next</h1>
          <p className="text-lg text-primary-100">A calm, step-by-step guide for the moment you realize your only car key is gone</p>
          <p className="text-sm text-primary-200 mt-4">Published: August 18, 2026</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12">
        <section className="mb-12">
          <p className="text-lg text-gray-700">
            Losing your only car key is stressful, but almost always solvable within a day. Here's what to
            do first, what your options are, and roughly what it will cost.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Immediate Steps</h2>
          <ol className="space-y-4">
            {immediateSteps.map((step, idx) => (
              <li key={idx} className="flex">
                <span className="font-bold text-primary-600 mr-4 text-lg">{idx + 1}.</span>
                <div>
                  <strong className="text-gray-900">{step.title}</strong>
                  <p className="text-gray-700">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Your Options for a Replacement</h2>
          <div className="space-y-4">
            {options.map((opt, idx) => (
              <div key={idx} className="p-4 bg-blue-50 rounded-lg">
                <h3 className="font-bold text-gray-900 mb-1">{opt.name}</h3>
                <p className="text-gray-700 text-sm">{opt.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12 bg-green-50 border-l-4 border-green-500 p-8 rounded-lg">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Typical Cost</h2>
          <p className="text-lg text-gray-700 font-semibold">Mechanical key cut from lock: ₹500-₹1,200 · Transponder/smart key from VIN: ₹1,500-₹3,000+</p>
          <p className="text-gray-600 mt-4">Costs vary by vehicle brand, key complexity, and whether a locksmith or dealer does the work.</p>
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
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Find Help Near You</h2>
          <p className="text-gray-700 mb-6">Browse verified key shops and locksmiths that handle lost-key replacement.</p>
          <a href="/services/lost-key-replacement" className="inline-block bg-primary-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors">
            Lost Key Replacement Services
          </a>
        </section>

        <section className="mt-16 pt-12 border-t border-gray-300">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">Related Articles</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <a href="/blog/how-to-find-reliable-key-shop" className="block p-6 border border-gray-300 rounded-lg hover:shadow-lg transition-shadow">
              <h4 className="font-bold text-gray-900 mb-2">How to Find a Reliable Key Shop</h4>
              <p className="text-gray-700 text-sm">A checklist for choosing a trustworthy shop</p>
            </a>
            <a href="/blog/car-key-duplication-guide" className="block p-6 border border-gray-300 rounded-lg hover:shadow-lg transition-shadow">
              <h4 className="font-bold text-gray-900 mb-2">Car Key Duplication Guide</h4>
              <p className="text-gray-700 text-sm">Everything about duplicating car keys</p>
            </a>
          </div>
        </section>
      </div>
    </article>
  );
}
