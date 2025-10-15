"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/shared/components/ui/drawer";

import { Button } from "@/shared/components/ui/button";
import { useAppContext } from "@/shared/contexts/app";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { useTranslations } from "next-intl";
import { SignInForm } from "./sign-in-form";

export function SignModal() {
  const t = useTranslations("common.sign");
  const { isShowSignModal, setIsShowSignModal } = useAppContext();

  // todo: dynamic set callbackURL
  const callbackURL = "/";

  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return (
      <Dialog open={isShowSignModal} onOpenChange={setIsShowSignModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("sign_in_title")}</DialogTitle>
            <DialogDescription>{t("sign_in_description")}</DialogDescription>
          </DialogHeader>
          <SignInForm callbackUrl={callbackURL} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={isShowSignModal} onOpenChange={setIsShowSignModal}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>{t("sign_in_title")}</DrawerTitle>
          <DrawerDescription>{t("sign_in_description")}</DrawerDescription>
        </DrawerHeader>
        <SignInForm callbackUrl={callbackURL} className="mt-8 px-4" />
        <DrawerFooter className="pt-4">
          <DrawerClose asChild>
            <Button variant="outline">{t("cancel_title")}</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
