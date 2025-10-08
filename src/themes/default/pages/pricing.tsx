import { Pricing as PricingType } from "@/shared/types/blocks/pricing";
import {
  FAQ as FAQType,
  Testimonials as TestimonialsType,
} from "@/shared/types/blocks/landing";
import { FAQ, Pricing, Testimonials } from "@/themes/default/blocks";
import { Subscription } from "@/shared/services/subscription";

export default async function PricingPage({
  locale,
  pricing,
  currentSubscription,
  faq,
  testimonials,
}: {
  locale?: string;
  pricing: PricingType;
  currentSubscription?: Subscription;
  faq?: FAQType;
  testimonials?: TestimonialsType;
}) {
  return (
    <>
      <Pricing pricing={pricing} currentSubscription={currentSubscription} />
      {faq && <FAQ faq={faq} />}
      {testimonials && <Testimonials testimonials={testimonials} />}
    </>
  );
}
