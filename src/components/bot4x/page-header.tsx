import { Cpu } from "lucide-react";

export function Bot4xHeader() {
  return (
    <header className="flex items-start gap-3">
      <div className="size-10 rounded-[10px] bg-[#0C447C] flex items-center justify-center shrink-0">
        <Cpu className="size-5 text-[#E6F1FB]" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-[20px] font-medium text-foreground leading-none">Bot4x</h1>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--brand-blue-deep)] text-foreground">v2.0</span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#1D9E75]">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#1D9E75] opacity-75 animate-ping" />
              <span className="relative inline-flex size-1.5 rounded-full bg-[#1D9E75]" />
            </span>
            Sistema ativo
          </span>
        </div>
        <p className="text-[12px] text-muted-foreground mt-1">
          Motor de Execução Algorítmica · AISignalRadar
        </p>
      </div>
    </header>
  );
}
