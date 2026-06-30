export type FlowStep<T extends string> = {
  id: T;
  label: string;
};

type FlowTone = "concierge" | "member";

const toneStyles: Record<
  FlowTone,
  {
    track: string;
    completeTrack: string;
    pendingDot: string;
    completeDot: string;
    activeDot: string;
    activeText: string;
    mutedText: string;
  }
> = {
  concierge: {
    track: "bg-[#d9d0c2]",
    completeTrack: "bg-[#b88746]",
    pendingDot: "border-[#d9d0c2] bg-[#fffdf8] text-[#6c7068]",
    completeDot: "border-[#123b35] bg-[#123b35] text-white",
    activeDot: "flow-step-active border-[#b88746] bg-[#b88746] text-white",
    activeText: "text-[#123b35]",
    mutedText: "text-[#6c7068]",
  },
  member: {
    track: "bg-[#e2d6c7]",
    completeTrack: "bg-[#b88746]",
    pendingDot: "border-[#e2d6c7] bg-[#fffdf8] text-[#706f66]",
    completeDot: "border-[#123b35] bg-[#123b35] text-white",
    activeDot: "flow-step-active border-[#b88746] bg-[#b88746] text-white",
    activeText: "text-[#123b35]",
    mutedText: "text-[#706f66]",
  },
};

export function FlowStrip<T extends string>({
  steps,
  activeId,
  tone = "concierge",
  label = "Proposal progress",
}: {
  steps: readonly FlowStep<T>[];
  activeId: T;
  tone?: FlowTone;
  label?: string;
}) {
  const styles = toneStyles[tone];
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === activeId),
  );

  return (
    <nav aria-label={label} className="overflow-x-auto px-2 py-2">
      <ol className={`flex ${steps.length > 4 ? "min-w-[420px]" : ""}`}>
        {steps.map((step, index) => {
          const isActive = index === activeIndex;
          const isComplete = index < activeIndex;
          const isReached = isActive || isComplete;

          return (
            <li
              key={step.id}
              aria-current={isActive ? "step" : undefined}
              className="relative flex min-w-0 flex-1 flex-col items-center gap-2 text-center"
            >
              {index < steps.length - 1 ? (
                <span
                  className={`flow-step-connector ${
                    index < activeIndex ? styles.completeTrack : styles.track
                  }`}
                />
              ) : null}
              <span
                className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold transition-all duration-300 ${
                  isActive
                    ? styles.activeDot
                    : isComplete
                      ? styles.completeDot
                      : styles.pendingDot
                }`}
              >
                {index + 1}
              </span>
              <span
                className={`truncate text-[11px] font-bold uppercase transition-colors duration-300 ${
                  isReached ? styles.activeText : styles.mutedText
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
