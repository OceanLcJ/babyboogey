import {
  BookOpenText,
  CreditCard,
  Gift,
  Image as ImageIcon,
  Smile,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

import { Link } from '@/core/i18n/navigation';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/types/blocks/common';
import { FAQItem, Section } from '@/shared/types/blocks/landing';

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                              */
/* -------------------------------------------------------------------------- */

const ROMAN_LOWER = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'];
function toRomanLower(n: number): string {
  return ROMAN_LOWER[n - 1] ?? String(n);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * The upstream i18n copy uses <strong>...</strong> to mark highlight words; we
 * convert the first occurrence into Fraunces italic <em> so the Nursery
 * Nightfall ink-brush underline kicks in.
 */
function renderTitleFromHtml(title: string | undefined): ReactNode {
  if (!title) return null;
  const match = title.match(/<strong>([\s\S]+?)<\/strong>/i);
  if (!match) return title;
  const before = title.slice(0, match.index ?? 0);
  const after = title.slice((match.index ?? 0) + match[0].length);
  return (
    <>
      {before}
      <em>{match[1]}</em>
      {after}
    </>
  );
}

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  Zap,
  BookOpenText,
  CreditCard,
  Sparkles,
  Image: ImageIcon,
  ImageIcon: ImageIcon,
  Gift,
  Smile,
};

function LandingCta({ button, index }: { button: Button; index: number }) {
  const isGhost = button.variant === 'outline';
  const cls = isGhost ? 'bb-home-ghost-btn' : 'bb-home-primary-btn';
  const iconKey = typeof button.icon === 'string' ? button.icon : undefined;
  const Icon = (iconKey && ICONS[iconKey]) || Sparkles;
  return (
    <Link
      key={index}
      href={button.url || '#'}
      target={button.target || '_self'}
      className={cls}
    >
      <Icon className="h-4 w-4" />
      <span>{button.title}</span>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface IconImageItem {
  title?: string;
  description?: string;
  icon?: string;
  image?: { src?: string; alt?: string };
}

interface TestimonialItem {
  name?: string;
  role?: string;
  quote?: string;
  image?: { src?: string; alt?: string };
}

interface PricingItem {
  title?: string;
  description?: string;
  label?: string;
  features_title?: string;
  features?: string[];
  price?: string;
  original_price?: string;
  unit?: string;
  is_featured?: boolean;
  button?: Button;
  group?: string;
  interval?: string;
}

interface PricingSection extends Section {
  groups?: { name: string; title?: string; is_featured?: boolean }[];
  items?: PricingItem[];
}

function resolvePricingCtaUrl(button?: Button): string {
  const url = button?.url;
  if (!url || url === '#pricing' || url === '/#pricing') {
    return '/pricing';
  }

  return url;
}

/* -------------------------------------------------------------------------- */
/* Introduce — features-list (3 cards)                                         */
/* -------------------------------------------------------------------------- */

const INTRO_FALLBACK_ICONS = ['ImageIcon', 'Smile', 'Gift'];

export function HomeIntroduce({ section }: { section?: Section }) {
  if (!section) return null;
  const items = (section.items || []) as IconImageItem[];

  return (
    <section
      id={section.id}
      className={cn('bb-home bb-home-introduce', section.className)}
    >
      <div className="container">
        <div className="bb-home-sec-head">
          {section.label && (
            <span className="bb-home-eyebrow">{section.label}</span>
          )}
          <h2 className="bb-home-title">
            {renderTitleFromHtml(section.title)}
          </h2>
          {section.description && (
            <p className="bb-home-desc">
              {renderTitleFromHtml(section.description)}
            </p>
          )}
        </div>

        <div className="bb-home-feat-list">
          {items.map((item, i) => {
            const iconName = item.icon || INTRO_FALLBACK_ICONS[i];
            const Icon = (iconName && ICONS[iconName]) || Sparkles;
            return (
              <article key={i} className="bb-home-feat">
                <span className="bb-home-feat-icon" aria-hidden="true">
                  <Icon className="h-5 w-5" />
                </span>
                {item.image?.src && (
                  <div className="bb-home-feat-photo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.image.src}
                      alt={item.image.alt || item.title || ''}
                    />
                  </div>
                )}
                <h3>{item.title}</h3>
                {item.description && <p>{item.description}</p>}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Benefits — polaroid tiles (3 use cases)                                     */
/* -------------------------------------------------------------------------- */

export function HomeBenefits({ section }: { section?: Section }) {
  if (!section) return null;
  const items = (section.items || []) as IconImageItem[];

  return (
    <section
      id={section.id}
      className={cn('bb-home bb-home-benefits', section.className)}
    >
      <div className="container">
        <div className="bb-home-sec-head">
          {section.label && (
            <span className="bb-home-eyebrow">{section.label}</span>
          )}
          <h2 className="bb-home-title">
            {renderTitleFromHtml(section.title)}
          </h2>
          {section.description && (
            <p className="bb-home-desc">{section.description}</p>
          )}
        </div>

        <div className="bb-home-benefits-wall">
          {items.map((item, i) => (
            <article key={i} className="bb-home-bene">
              <span className="bb-home-bene-pick">
                {section.pick_label || 'Pick'} {pad2(i + 1)}
              </span>
              {item.image?.src && (
                <div className="bb-home-bene-photo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.image.src}
                    alt={item.image.alt || item.title || ''}
                  />
                </div>
              )}
              <div className="bb-home-bene-cap">
                <h3>{item.title}</h3>
                <span className="num">{toRomanLower(i + 1)}.</span>
              </div>
              {item.description && (
                <p className="bb-home-bene-desc">{item.description}</p>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Usage — 3 steps with dashed connector                                       */
/* -------------------------------------------------------------------------- */

interface UsageItem {
  title?: string;
  description?: string;
}

export function HomeUsage({ section }: { section?: Section }) {
  if (!section) return null;
  const items = (section.items || []) as UsageItem[];

  return (
    <section
      id={section.id}
      className={cn('bb-home bb-home-usage', section.className)}
    >
      <div className="container">
        <div className="bb-home-sec-head">
          {section.eyebrow && (
            <span className="bb-home-eyebrow">{section.eyebrow}</span>
          )}
          <h2 className="bb-home-title">
            {renderTitleFromHtml(section.title)}
          </h2>
          {section.description && (
            <p className="bb-home-desc">{section.description}</p>
          )}
        </div>

        <div className="bb-home-steps">
          {items.map((item, i) => (
            <article key={i} className="bb-home-step">
              <span className="bb-home-step-dot" aria-hidden="true">
                {toRomanLower(i + 1)}
              </span>
              <h3>{item.title}</h3>
              {item.description && <p>{item.description}</p>}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Features — accordion (2 items)                                              */
/* -------------------------------------------------------------------------- */

export function HomeFeatures({ section }: { section?: Section }) {
  if (!section) return null;
  const items = (section.items || []) as IconImageItem[];

  return (
    <section
      id={section.id}
      className={cn('bb-home bb-home-features', section.className)}
    >
      <div className="container">
        <div className="bb-home-sec-head">
          {section.label && (
            <span className="bb-home-eyebrow">{section.label}</span>
          )}
          <h2 className="bb-home-title">
            {renderTitleFromHtml(section.title)}
          </h2>
          {section.description && (
            <p className="bb-home-desc">{section.description}</p>
          )}
        </div>

        <div className="bb-home-acc-wrap">
          {items.map((item, i) => (
            <details key={i} className="bb-home-acc-item" open={i === 0}>
              <summary>
                <span className="bb-home-acc-num">{toRomanLower(i + 1)}.</span>
                <span className="bb-home-acc-title">{item.title}</span>
                <span className="bb-home-acc-plus" aria-hidden="true" />
              </summary>
              <div className="bb-home-acc-body">
                {item.description && <p>{item.description}</p>}
                {item.image?.src && (
                  <div className="bb-home-acc-photo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.image.src}
                      alt={item.image.alt || item.title || ''}
                    />
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Testimonials                                                                */
/* -------------------------------------------------------------------------- */

export function HomeTestimonials({ section }: { section?: Section }) {
  if (!section) return null;
  const items = (section.items || []) as TestimonialItem[];

  return (
    <section
      id={section.id}
      className={cn('bb-home bb-home-testi', section.className)}
    >
      <div className="container">
        <div className="bb-home-sec-head">
          {section.eyebrow && (
            <span className="bb-home-eyebrow">{section.eyebrow}</span>
          )}
          <h2 className="bb-home-title">
            {renderTitleFromHtml(section.title)}
          </h2>
          {section.description && (
            <p className="bb-home-desc">{section.description}</p>
          )}
        </div>

        <div className="bb-home-testi-grid">
          {items.map((item, i) => (
            <article key={i} className="bb-home-testi-card">
              {item.quote && <p className="bb-home-testi-quote">{item.quote}</p>}
              <div className="bb-home-testi-who">
                <div
                  className="bb-home-testi-avatar"
                  style={
                    item.image?.src
                      ? { backgroundImage: `url(${item.image.src})` }
                      : undefined
                  }
                />
                <div className="bb-home-testi-meta">
                  <b>{item.name}</b>
                  <span>{item.role}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Pricing — credit-pack group only (landing preview)                          */
/* -------------------------------------------------------------------------- */

export function HomePricing({ section }: { section?: PricingSection }) {
  if (!section) return null;
  const items = (section.items || []) as PricingItem[];
  const featuredGroup = section.groups?.find((g) => g.is_featured);
  const groupName = featuredGroup?.name;
  const groupItems = groupName
    ? items.filter((it) => it.group === groupName)
    : items.filter((it) => it.interval === 'one-time');

  if (groupItems.length === 0) return null;

  return (
    <section
      id={section.id}
      className={cn('bb-home bb-home-pricing', section.className)}
    >
      <div className="container">
        <div className="bb-home-sec-head">
          {section.eyebrow && (
            <span className="bb-home-eyebrow">{section.eyebrow}</span>
          )}
          <h2 className="bb-home-title">
            {renderTitleFromHtml(section.title)}
          </h2>
          {section.description && (
            <p className="bb-home-desc">{section.description}</p>
          )}
        </div>

        <div className="bb-home-price-grid">
          {groupItems.map((item, i) => (
            <article
              key={i}
              className={cn(
                'bb-home-price-card',
                item.is_featured && 'featured'
              )}
              data-label={item.label || section.popular_label || 'Popular'}
            >
              <p className="bb-home-price-name">{item.title}</p>
              <div className="bb-home-price-amt">
                <b>{item.price}</b>
                {item.unit && <span>{item.unit}</span>}
                {item.original_price && <s>{item.original_price}</s>}
              </div>
              {item.description && (
                <p className="bb-home-price-desc">{item.description}</p>
              )}
              {item.features && item.features.length > 0 && (
                <ul className="bb-home-price-feats">
                  {item.features.map((f, j) => (
                    <li key={j}>{f}</li>
                  ))}
                </ul>
              )}
              {item.button?.title && (
                <LandingCta
                  button={{
                    ...item.button,
                    url: resolvePricingCtaUrl(item.button),
                    variant: item.is_featured ? 'default' : 'outline',
                  }}
                  index={i}
                />
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* FAQ                                                                         */
/* -------------------------------------------------------------------------- */

export function HomeFaq({ section }: { section?: Section }) {
  if (!section) return null;
  const items = (section.items || []) as FAQItem[];

  return (
    <section
      id={section.id}
      className={cn('bb-home bb-home-faq', section.className)}
    >
      <div className="container bb-home-faq-grid">
        <aside className="bb-home-faq-side">
          {section.eyebrow && (
            <span className="bb-home-eyebrow left">{section.eyebrow}</span>
          )}
          <h2 className="bb-home-title">
            {renderTitleFromHtml(section.title)}
          </h2>
          {section.description && (
            <p className="bb-home-desc">{section.description}</p>
          )}
          {section.helper?.text && (
            <div className="bb-home-faq-helper">
              <div>
                {section.helper.label && <b>{section.helper.label}</b>}{' '}
                {section.helper.text}
              </div>
            </div>
          )}
        </aside>
        <div className="bb-home-faq-list">
          {items.map((item, i) => (
            <details key={i} className="bb-home-qa" open={i === 0}>
              <summary>{item.question}</summary>
              {item.answer && <p>{item.answer}</p>}
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* CTA                                                                         */
/* -------------------------------------------------------------------------- */

const CTA_COLLAGE = [
  {
    src: 'https://img.aibabydance.org/assets/imgs/example/image-1.png',
    tag: '01',
    label: 'Before',
    pos: 'a' as const,
  },
  {
    src: 'https://r2.babyboogey.com/assets/imgs/blog/temp-05.mp4',
    tag: '02',
    label: 'Boogie',
    pos: 'b' as const,
    isVideo: true,
  },
];

export function HomeCta({ section }: { section?: Section }) {
  if (!section) return null;

  return (
    <section
      id={section.id}
      className={cn('bb-home bb-home-cta', section.className)}
    >
      <div className="container">
        <div className="bb-home-cta-card">
          <div className="bb-home-cta-sparks" aria-hidden="true">
            <span className="s1">✦</span>
            <span className="s2">✺</span>
            <span className="s3">✧</span>
          </div>
          <div className="bb-home-cta-copy">
            {section.eyebrow && (
              <span className="bb-home-eyebrow left">{section.eyebrow}</span>
            )}
            <h2 className="bb-home-title">
              {renderTitleFromHtml(section.title)}
            </h2>
            {section.description && (
              <p className="bb-home-desc">{section.description}</p>
            )}
            {section.buttons && section.buttons.length > 0 && (
              <div className="bb-home-cta-row">
                {section.buttons.map((btn, i) => (
                  <LandingCta key={i} button={btn} index={i} />
                ))}
              </div>
            )}
            {section.trust_bar && (
              <p className="bb-home-cta-trust">
                {section.trust_bar.rating && (
                  <span>
                    <b>{section.trust_bar.rating}</b>
                  </span>
                )}
                {section.trust_bar.rating && section.trust_bar.audience && (
                  <span className="sep" aria-hidden="true" />
                )}
                {section.trust_bar.audience && (
                  <span>{section.trust_bar.audience}</span>
                )}
                {section.trust_bar.audience && section.trust_bar.pricing && (
                  <span className="sep" aria-hidden="true" />
                )}
                {section.trust_bar.pricing && (
                  <span>{section.trust_bar.pricing}</span>
                )}
              </p>
            )}
          </div>
          <div className="bb-home-cta-collage" aria-hidden="true">
            {CTA_COLLAGE.map((c, i) => (
              <div key={c.tag} className={`bb-home-cta-poly ${c.pos}`}>
                <div className="bb-home-cta-poly-photo">
                  {c.isVideo ? (
                    <video
                      src={c.src}
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.src} alt="" />
                  )}
                </div>
                <div className="bb-home-cta-poly-tag">
                  <b>{c.tag}</b>
                  <span>{section.collage_labels?.[i] ?? c.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
