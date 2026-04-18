import { CreditCard, Image as ImageIcon, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

import { Link } from '@/core/i18n/navigation';
import { BabyStyleId } from '@/shared/services/baby-image/styles';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/types/blocks/common';
import { FAQItem, Hero, Section } from '@/shared/types/blocks/landing';

import './baby-image-landing.css';

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                              */
/* -------------------------------------------------------------------------- */

const STYLE_THUMB_FILES: Record<BabyStyleId, string> = {
  'pixar-3d': 'ai-baby-photo-pixar-3d-animation-style.webp',
  ghibli: 'ai-baby-photo-hand-drawn-fantasy-style.webp',
  anime: 'ai-baby-photo-classic-anime-style.webp',
  claymation: 'ai-baby-photo-claymation-sculpt-style.webp',
  chibi: 'ai-baby-photo-chibi-kawaii-style.webp',
  watercolor: 'ai-baby-photo-watercolor-storybook-style.webp',
  plush: 'ai-baby-photo-plush-doll-style.webp',
  'pixel-art': 'ai-baby-photo-pixel-art-retro-style.webp',
};

const STYLE_THUMB_BASE =
  'https://r2.babyboogey.com/assets/imgs/showcases/ai-baby-image-generator';

function styleThumb(id: BabyStyleId): string {
  return `${STYLE_THUMB_BASE}/${STYLE_THUMB_FILES[id]}`;
}

const ROMAN_LOWER = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'];
function toRomanLower(n: number): string {
  return ROMAN_LOWER[n - 1] ?? String(n);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function renderTitle(
  title: string | undefined,
  highlight: string | undefined
): ReactNode {
  if (!title) return null;
  if (!highlight) return title;
  const parts = title.split(highlight, 2);
  if (parts.length < 2) return title;
  return (
    <>
      {parts[0]}
      <em>{highlight}</em>
      {parts[1]}
    </>
  );
}

function LandingCta({
  button,
  index,
}: {
  button: Button;
  index: number;
}) {
  const isGhost = button.variant === 'outline';
  const cls = isGhost ? 'bb-land-ghost-btn' : 'bb-land-primary-btn';
  // pick a defensible default icon if i18n didn't hint one
  const Icon =
    button.icon === 'Image' || button.icon === 'ImageIcon'
      ? ImageIcon
      : button.icon === 'CreditCard'
        ? CreditCard
        : Sparkles;
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
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

const HERO_STRIP: BabyStyleId[] = [
  'pixar-3d',
  'watercolor',
  'chibi',
  'ghibli',
  'plush',
];
const HERO_STRIP_ROT = ['-3deg', '1.8deg', '-0.6deg', '2.4deg', '-1.6deg'];
const HERO_STRIP_Y = ['10px', '-2px', '0', '0', '6px'];

export function BabyImageLandingHero({
  section,
  styleLabels,
}: {
  section?: Hero;
  styleLabels?: Partial<Record<BabyStyleId, string>>;
}) {
  if (!section) return null;
  return (
    <section id={section.id} className={cn('bb-land bb-land-hero', section.className)}>
      <div className="container">
        {section.eyebrow && (
          <span className="bb-land-eyebrow">{section.eyebrow}</span>
        )}
        <h1 className="bb-land-hero-title">
          {renderTitle(section.title, section.highlight_text)}
        </h1>
        {section.description && (
          <p className="bb-land-hero-sub">{section.description}</p>
        )}
        {section.buttons && section.buttons.length > 0 && (
          <div className="bb-land-cta-row">
            {section.buttons.map((btn, i) => (
              <LandingCta key={i} button={btn} index={i} />
            ))}
          </div>
        )}
      </div>

      <div className="bb-land-hero-strip" aria-hidden="true">
        {HERO_STRIP.map((id, i) => (
          <div
            key={id}
            className="bb-land-poly"
            style={{ transform: `rotate(${HERO_STRIP_ROT[i]}) translateY(${HERO_STRIP_Y[i]})` }}
          >
            <div
              className="bb-land-poly-photo"
              style={{ backgroundImage: `url(${styleThumb(id)})` }}
            />
            <div className="bb-land-poly-tag">
              <b>{pad2(i + 1)}</b>
              <span>{styleLabels?.[id] ?? id.replace('-', ' ')}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Showcase — polaroid wall                                                    */
/* -------------------------------------------------------------------------- */

const TILE_ROT = [
  '-1.4deg',
  '1.2deg',
  '-0.6deg',
  '1.6deg',
  '1.1deg',
  '-1.3deg',
  '0.7deg',
  '-1.5deg',
];

interface ShowcaseItem {
  title?: string;
  description?: string;
  icon?: string;
  image?: { src?: string; alt?: string };
}

export function BabyImageLandingShowcase({
  section,
}: {
  section?: Section;
}) {
  if (!section) return null;
  const items = (section.items || []) as ShowcaseItem[];

  return (
    <section
      id={section.id}
      className={cn('bb-land bb-land-showcase', section.className)}
    >
      <div className="container">
        <div className="bb-land-head">
          <div>
            {section.eyebrow && (
              <span className="bb-land-eyebrow left">{section.eyebrow}</span>
            )}
            <h2 className="bb-land-title">
              {renderTitle(section.title, section.highlight_text)}
            </h2>
            {section.description && (
              <p className="bb-land-desc">{section.description}</p>
            )}
          </div>
          {items.length > 0 && (
            <span className="bb-land-legend">
              01 · {pad2(items.length)} Hand-tuned
            </span>
          )}
        </div>

        <div className="bb-land-wall">
          {items.map((item, i) => (
            <article
              key={i}
              className="bb-land-tile"
              style={{ transform: `rotate(${TILE_ROT[i % TILE_ROT.length]})` }}
            >
              <span className="bb-land-tile-pick">{pad2(i + 1)}</span>
              {item.image?.src && (
                <div className="bb-land-tile-photo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image.src} alt={item.image.alt || item.title || ''} />
                </div>
              )}
              <div className="bb-land-tile-cap">
                <h3>{item.title}</h3>
                <span className="bb-land-tile-num">{toRomanLower(i + 1)}.</span>
              </div>
              {item.description && (
                <p className="bb-land-tile-desc">{item.description}</p>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Usage — 3 steps                                                             */
/* -------------------------------------------------------------------------- */

interface UsageItem {
  title?: string;
  description?: string;
}

export function BabyImageLandingUsage({
  section,
}: {
  section?: Section;
}) {
  if (!section) return null;
  const items = (section.items || []) as UsageItem[];

  return (
    <section
      id={section.id}
      className={cn('bb-land bb-land-usage', section.className)}
    >
      <div className="container">
        <div className="bb-land-usage-head">
          {section.eyebrow && (
            <span className="bb-land-eyebrow">{section.eyebrow}</span>
          )}
          <h2 className="bb-land-title">
            {renderTitle(section.title, section.highlight_text)}
          </h2>
          {section.description && (
            <p className="bb-land-desc">{section.description}</p>
          )}
        </div>

        <div className="bb-land-steps">
          {items.map((item, i) => (
            <article key={i} className="bb-land-step">
              <span className="bb-land-step-dot" aria-hidden="true">
                {i + 1}
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
/* FAQ                                                                         */
/* -------------------------------------------------------------------------- */

export function BabyImageLandingFaq({
  section,
}: {
  section?: Section;
}) {
  if (!section) return null;
  const items = (section.items || []) as FAQItem[];

  return (
    <section
      id={section.id}
      className={cn('bb-land bb-land-faq', section.className)}
    >
      <div className="container bb-land-faq-grid">
        <aside className="bb-land-faq-side">
          {section.eyebrow && (
            <span className="bb-land-eyebrow left">{section.eyebrow}</span>
          )}
          <h2 className="bb-land-title">
            {renderTitle(section.title, section.highlight_text)}
          </h2>
          {section.description && (
            <p className="bb-land-desc">{section.description}</p>
          )}
          {section.helper?.text && (
            <div className="bb-land-faq-helper">
              <div>
                {section.helper.label && <b>{section.helper.label}</b>}{' '}
                {section.helper.text}
              </div>
            </div>
          )}
        </aside>
        <div className="bb-land-faq-list">
          {items.map((item, i) => (
            <details key={i} className="bb-land-faq-item" open={i === 0}>
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

export function BabyImageLandingCta({
  section,
}: {
  section?: Section;
}) {
  if (!section) return null;
  return (
    <section
      id={section.id}
      className={cn('bb-land bb-land-cta', section.className)}
    >
      <div className="container">
        <div className="bb-land-cta-card">
          <div>
            {section.eyebrow && (
              <span className="bb-land-eyebrow left">{section.eyebrow}</span>
            )}
            <h2 className="bb-land-title">
              {renderTitle(section.title, section.highlight_text)}
            </h2>
            {section.description && (
              <p className="bb-land-desc">{section.description}</p>
            )}
            {section.buttons && section.buttons.length > 0 && (
              <div className="bb-land-cta-row">
                {section.buttons.map((btn, i) => (
                  <LandingCta key={i} button={btn} index={i} />
                ))}
              </div>
            )}
          </div>
          <div className="bb-land-cta-collage" aria-hidden="true">
            <div className="bb-land-cta-poly a">
              <div
                className="bb-land-cta-poly-photo"
                style={{ backgroundImage: `url(${styleThumb('pixar-3d')})` }}
              />
              <div className="bb-land-cta-poly-tag">
                <b>01</b>
                <span>Pixar 3D</span>
              </div>
            </div>
            <div className="bb-land-cta-poly b">
              <div
                className="bb-land-cta-poly-photo"
                style={{ backgroundImage: `url(${styleThumb('watercolor')})` }}
              />
              <div className="bb-land-cta-poly-tag">
                <b>06</b>
                <span>Watercolor</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
