"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { RolePicker, Splash } from "@/components/onboarding/Intro";
import s from "@/components/onboarding/onboarding.module.css";
import {
  buildSpec,
  DEFAULT_PICKS,
  type Picks,
  patchPending,
  type Role,
  readPending,
} from "@/components/onboarding/picks";
import { BuilderStep, ReaderStep, StudentStep } from "@/components/onboarding/RoleSteps";
import { WalletStep } from "@/components/onboarding/WalletStep";
import { useSession } from "@/lib/session";

type Step = "splash" | "role" | "pick" | "wallet";

/**
 * Onboarding: splash → "Bạn là ai?" → bước theo vai trò → ví (kết nối, mạng, nạp AVAX, handle, ký 1 tx).
 * Ví đã kết nối sẵn (vd. e2e) thì vào thẳng bước ví. Luôn có "Bỏ qua" về bảng tin (đọc trước, viết sau).
 */
export default function Welcome() {
  const t = useTranslations("onboarding");
  const { status } = useSession();
  const [step, setStep] = useState<Step>("splash");
  const [role, setRole] = useState<Role>("builder");
  const [picked, setPicked] = useState(false);
  const [picks, setPicks] = useState<Picks>(DEFAULT_PICKS);
  /** Người dùng đã tự bấm qua intro: không tự nhảy bước nữa. */
  const touched = useRef(false);

  useEffect(() => {
    const p = readPending();
    if (p?.role) {
      setRole(p.role);
      setPicked(true);
    }
    if (p?.picks) setPicks(p.picks);
  }, []);

  useEffect(() => {
    if (status !== "disconnected" && !touched.current) setStep("wallet");
  }, [status]);

  function go(next: Step) {
    touched.current = true;
    setStep(next);
  }

  function finishPicks() {
    const spec = buildSpec(role, picks, t("myFeed"));
    patchPending({ role, picks, spec });
    setPicked(true);
    go("wallet");
  }

  return (
    <div className={`${s.screen} ${step === "splash" ? s.splash : ""}`}>
      <div key={step} className={`${s.column} ${step === "splash" ? "" : s.enter}`}>
        {step === "splash" && <Splash onStart={() => go("role")} />}
        {step === "role" && (
          <RolePicker
            role={role}
            onRole={setRole}
            onBack={() => go("splash")}
            onNext={() => {
              patchPending({ role });
              go("pick");
            }}
          />
        )}
        {step === "pick" && role === "builder" && (
          <BuilderStep onBack={() => go("role")} onNext={finishPicks} />
        )}
        {step === "pick" && role === "student" && (
          <StudentStep picks={picks} onPicks={setPicks} onBack={() => go("role")} onNext={finishPicks} />
        )}
        {step === "pick" && role === "reader" && (
          <ReaderStep picks={picks} onPicks={setPicks} onBack={() => go("role")} onNext={finishPicks} />
        )}
        {step === "wallet" && (
          <WalletStep role={picked ? role : null} picks={picks} onBack={() => go(picked ? "pick" : "role")} />
        )}
      </div>
    </div>
  );
}
