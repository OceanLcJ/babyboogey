import {
  Header as HeaderType,
  Footer as FooterType,
} from "@/shared/types/blocks/landing";
import { ReactNode } from "react";

export default async function LandingLayout({
  children,
  header,
  footer,
}: {
  children: ReactNode;
  header: HeaderType;
  footer: FooterType;
}) {
  return (
    <div>
      <header>header</header>
      <footer>fotoer</footer>
    </div>
  );
}
