import { ReactNode } from 'react';

import {
  AgreementNav,
  Brand,
  Button,
  Nav,
  NavItem,
  SocialNav,
  UserNav,
} from './common';
import { FormSubmit } from './form';

export interface SectionItem extends NavItem {
  [key: string]: UnsafeAny;
}

export interface Section {
  id?: string;
  block?: string;
  label?: string;
  sr_only_title?: string;
  title?: string;
  description?: string;
  tip?: string;
  buttons?: Button[];
  icon?: string | ReactNode;
  image?: Image;
  image_invert?: Image;
  items?: SectionItem[];
  image_position?: 'left' | 'right' | 'top' | 'bottom' | 'center';
  text_align?: 'left' | 'center' | 'right';
  className?: string;
  component?: ReactNode;
  [key: string]: UnsafeAny;
}

// header props for header component
export interface Header extends Section {
  id?: string;
  brand?: Brand;
  nav?: Nav;
  buttons?: Button[];
  user_nav?: UserNav;
  show_theme?: boolean;
  show_locale?: boolean;
  show_sign?: boolean;
  className?: string;
}

// footer props for footer component
export interface Footer extends Section {
  id?: string;
  brand?: Brand;
  nav?: Nav;
  copyright?: string;
  social?: SocialNav;
  agreement?: AgreementNav;
  show_theme?: boolean;
  show_locale?: boolean;
  show_built_with?: boolean;
  className?: string;
}

// hero props for hero component
export interface Hero extends Section {
  id?: string;
  announcement?: Button;
  show_avatars?: boolean;
  avatars_tip?: string;
  show_award?: boolean;
  highlight_text?: string;
}

export type Logos = Section;

export type Features = Section;

export type Stats = Section;

export type Showcases = Section;

export interface FAQItem extends SectionItem {
  question?: string;
  answer?: string;
}

export interface FAQ extends Section {
  items?: FAQItem[];
}

export type CTA = Section;

export interface Subscribe extends Section {
  submit?: FormSubmit;
}

export interface TestimonialsItem extends SectionItem {
  name?: string;
  role?: string;
  quote?: string;
  avatar?: Image;
}

export interface Testimonials extends Section {
  items?: TestimonialsItem[];
}

// landing props for landing page component
export interface Landing {
  header?: Header;
  hero?: Hero;
  logos?: Logos;
  introduce?: Features;
  benefits?: Features;
  usage?: Features;
  features?: Features;
  stats?: Stats;
  showcases?: Showcases;
  subscribe?: Subscribe;
  faq?: FAQ;
  cta?: CTA;
  testimonials?: Testimonials;
  footer?: Footer;
  sections?: Section[];
}

export interface DynamicPage {
  title?: string;
  description?: string;
  sections?: Record<string, Section>;
  show_sections?: string[];
}
