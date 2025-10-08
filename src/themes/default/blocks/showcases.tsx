import { Card, CardContent } from "@/shared/components/ui/card";

import Image from "next/image";
import { Link } from "@/core/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { Showcases as ShowcasesType } from "@/shared/types/blocks/landing";

export function Showcases({
  showcases,
  className,
}: {
  showcases: ShowcasesType;
  className?: string;
}) {
  return (
    <section
      id={showcases.id}
      className={cn("py-16 md:py-36", showcases.className, className)}
    >
      <div className="mx-auto mb-12 text-center">
        {showcases.sr_only_title && (
          <h1 className="sr-only">{showcases.sr_only_title}</h1>
        )}
        <h2 className="mb-6 text-pretty text-3xl font-bold lg:text-4xl">
          {showcases.title}
        </h2>
        <p className="mb-4 max-w-xl text-muted-foreground lg:max-w-none lg:text-lg">
          {showcases.description}
        </p>
      </div>

      <div className="container grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {showcases.items?.map((item, index) => (
          <Link key={index} href={item.url || ""} target={item.target}>
            <Card className="p-0 overflow-hidden transition-all hover:shadow-lg dark:hover:shadow-primary/10">
              <CardContent className="p-0">
                <div className="relative aspect-16/10 w-full overflow-hidden">
                  <Image
                    src={item.image?.src ?? ""}
                    alt={item.image?.alt ?? ""}
                    fill
                    className="object-cover rounded-t-lg transition-transform duration-300 hover:scale-110"
                  />
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-semibold mb-2 line-clamp-1 text-balance">
                    {item.title}
                  </h3>
                  <p
                    className="text-sm text-muted-foreground line-clamp-3"
                    dangerouslySetInnerHTML={{ __html: item.description ?? "" }}
                  />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
