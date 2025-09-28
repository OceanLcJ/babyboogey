import { lazy, Suspense, ComponentType } from "react";

const iconCache: { [key: string]: ComponentType<any> } = {};

// 自动判断图标库的函数
function detectIconLibrary(name: string): "ri" | "lucide" {
  // React Icons 的图标都以 "Ri" 开头
  if (name.startsWith("Ri")) {
    return "ri";
  }
  // 其他情况默认使用 lucide
  return "lucide";
}

export function SmartIcon({
  name,
  size = 24,
  className,
  ...props
}: {
  name: string;
  size?: number;
  className?: string;
  [key: string]: any;
}) {
  const library = detectIconLibrary(name);
  const cacheKey = `${library}-${name}`;

  if (!iconCache[cacheKey]) {
    if (library === "ri") {
      // React Icons (Remix Icons)
      iconCache[cacheKey] = lazy(async () => {
        try {
          const module = await import("react-icons/ri");
          const IconComponent = module[name as keyof typeof module];
          if (IconComponent) {
            return { default: IconComponent as ComponentType<any> };
          } else {
            console.warn(`Icon "${name}" not found in react-icons/ri, using fallback`);
            return { default: module.RiQuestionLine as ComponentType<any> };
          }
        } catch (error) {
          console.error(`Failed to load react-icons/ri:`, error);
          const fallbackModule = await import("react-icons/ri");
          return { default: fallbackModule.RiQuestionLine as ComponentType<any> };
        }
      });
    } else {
      // Lucide React (default)
      iconCache[cacheKey] = lazy(async () => {
        try {
          const module = await import("lucide-react");
          const IconComponent = module[name as keyof typeof module];
          if (IconComponent) {
            return { default: IconComponent as ComponentType<any> };
          } else {
            console.warn(`Icon "${name}" not found in lucide-react, using fallback`);
            return { default: module.HelpCircle as ComponentType<any> };
          }
        } catch (error) {
          console.error(`Failed to load lucide-react:`, error);
          const fallbackModule = await import("lucide-react");
          return { default: fallbackModule.HelpCircle as ComponentType<any> };
        }
      });
    }
  }

  const IconComponent = iconCache[cacheKey];

  return (
    <Suspense fallback={<div style={{ width: size, height: size }} />}>
      <IconComponent size={size} className={className} {...props} />
    </Suspense>
  );
}
