"use client";

import { LandingHeader } from "./landing-header";
import { HeroSection } from "./hero-section";
import { HowItWorksSection } from "./how-it-works-section";
import { CoreFeaturesSection } from "./core-features-section";
import { SecondaryFeaturesSection } from "./secondary-features-section";
import { SocialProofSection } from "./social-proof-section";
import { FaqSection } from "./faq-section";
import { CtaSection } from "./cta-section";
import { LandingFooter } from "./landing-footer";

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
    <div
      id="landing-scroll-container"
      className="h-screen overflow-y-auto scroll-smooth"
    >
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
