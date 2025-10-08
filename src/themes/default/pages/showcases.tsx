import {
  Showcases as ShowcasesType,
  CTA as CTAType,
} from "@/shared/types/blocks/landing";
import { CTA, Showcases } from "@/themes/default/blocks";

export default async function ShowcasesPage({
  locale,
  showcases,
  cta,
}: {
  locale?: string;
  showcases: ShowcasesType;
  cta?: CTAType;
}) {
  return (
    <>
      <Showcases showcases={showcases} />
      {cta && <CTA cta={cta} className="bg-muted" />}
    </>
  );
}
