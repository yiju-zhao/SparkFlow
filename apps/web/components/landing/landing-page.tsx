"use client";

import dynamic from "next/dynamic";
import { LandingHeader } from "./landing-header";
import { HeroSection } from "./hero-section";
import { LandingFooter } from "./landing-footer";

// Lazy-load below-the-fold sections to reduce initial bundle size
const HowItWorksSection = dynamic(() =>
  import("./how-it-works-section").then((m) => ({ default: m.HowItWorksSection })),
);
const CoreFeaturesSection = dynamic(() =>
  import("./core-features-section").then((m) => ({ default: m.CoreFeaturesSection })),
);
const SecondaryFeaturesSection = dynamic(() =>
  import("./secondary-features-section").then((m) => ({
    default: m.SecondaryFeaturesSection,
  })),
);
const SocialProofSection = dynamic(() =>
  import("./social-proof-section").then((m) => ({ default: m.SocialProofSection })),
);
const FaqSection = dynamic(() => import("./faq-section").then((m) => ({ default: m.FaqSection })));
const CtaSection = dynamic(() => import("./cta-section").then((m) => ({ default: m.CtaSection })));

interface LandingPageProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string | null;
  } | null;
}

export function LandingPage({ user }: LandingPageProps) {
  return (
    <div id="landing-scroll-container" className="h-screen overflow-y-auto scroll-smooth">
      <LandingHeader user={user} />
      <main>
        <HeroSection isLoggedIn={!!user} />
        <HowItWorksSection />
        <CoreFeaturesSection />
        <SecondaryFeaturesSection />
        <SocialProofSection />
        <FaqSection />
        <CtaSection isLoggedIn={!!user} />
      </main>
      <LandingFooter />
    </div>
  );
}
