import { useState, Component, ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Activity, FlaskConical, Info } from 'lucide-react';

interface DiagnosisDisplayProps {
  diagnosisText: string;
  confidence: number | null;
  onSelectedTestsChange: (tests: string[]) => void;
}

interface ParsedDiagnosis {
  diagnoses: { rank: number; name: string; description: string }[];
  tests: string[];
  urgency: string;
  disclaimer: string;
}

// ── Parser ────────────────────────────────────────────────────────────────────
function parseDiagnosis(text: string): ParsedDiagnosis {
  const result: ParsedDiagnosis = { diagnoses: [], tests: [], urgency: '', disclaimer: '' };
  if (!text) return result;

  const lines = text.split('\n');
  let section = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (/###?\s*\d+\.\s*(possible\s*diagnos|diagnos)/i.test(line) || /^\*{0,2}\d+\.\s*(possible\s*diagnos)/i.test(line)) { section = 'diagnoses'; continue; }
    if (/###?\s*\d+\.\s*(confidence)/i.test(line) || /confidence\s*level/i.test(line)) { section = 'confidence'; continue; }
    if (/###?\s*\d+\.\s*(recommended|medical\s*test)/i.test(line) || /recommended\s*.*test/i.test(line)) { section = 'tests'; continue; }
    if (/###?\s*\d+\.\s*(urgency)/i.test(line) || /urgency\s*assessment/i.test(line)) { section = 'urgency'; continue; }
    if (/^\*?disclaimer/i.test(line) || /^\*this analysis/i.test(line)) { section = 'disclaimer'; }

    if (!line) continue;

    if (section === 'diagnoses') {
      const m = line.match(/^\*{0,2}(\d+)\.\*{0,2}\s+\*{0,2}([^:*]+)\*{0,2}:?\s*(.*)/);
      if (m) result.diagnoses.push({ rank: parseInt(m[1]), name: m[2].replace(/\*\*/g, '').trim(), description: m[3].replace(/\*\*/g, '').trim() });
    } else if (section === 'tests') {
      const m = line.match(/^[-*•]\s+\*{0,2}([^:*]+)\*{0,2}:?\s*(.*)/);
      if (m) { const t = m[1].replace(/\*\*/g, '').trim(); if (t.length > 2) result.tests.push(t); }
    } else if (section === 'urgency') {
      result.urgency += (result.urgency ? ' ' : '') + line.replace(/\*\*/g, '').trim();
    } else if (section === 'disclaimer') {
      result.disclaimer += (result.disclaimer ? ' ' : '') + line.replace(/[*_]/g, '').trim();
    }
  }
  return result;
}

// ── Urgency helpers ───────────────────────────────────────────────────────────
const urgencyLevel = (text: string): 'emergency' | 'urgent' | 'moderate' | 'low' => {
  const l = text.toLowerCase();
  if (l.includes('emergency') || l.includes('immediate') || l.includes('critical')) return 'emergency';
  if (l.includes('urgent') || l.includes('high')) return 'urgent';
  if (l.includes('moderate') || l.includes('medium')) return 'moderate';
  return 'low';
};

const urgencyConfig = {
  emergency: { bg: 'bg-red-50',    border: 'border-red-400',    text: 'text-red-800',    badge: 'bg-red-600 text-white',         icon: 'text-red-600',    pulse: true,  label: 'EMERGENCY' },
  urgent:    { bg: 'bg-orange-50', border: 'border-orange-400', text: 'text-orange-800', badge: 'bg-orange-500 text-white',      icon: 'text-orange-500', pulse: false, label: 'URGENT' },
  moderate:  { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-800', badge: 'bg-yellow-400 text-yellow-900', icon: 'text-yellow-600', pulse: false, label: 'Moderate' },
  low:       { bg: 'bg-green-50',  border: 'border-green-300',  text: 'text-green-800',  badge: 'bg-green-500 text-white',       icon: 'text-green-600',  pulse: false, label: 'Low' },
};

const rankColors = ['text-red-500', 'text-orange-500', 'text-yellow-500', 'text-blue-500', 'text-muted-foreground'];

// ── Error Boundary ────────────────────────────────────────────────────────────
class DiagnosisErrorBoundary extends Component<{ children: ReactNode; rawText: string }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError() { return { crashed: true }; }
  render() {
    if (this.state.crashed) {
      return (
        <div className="p-4 rounded-lg bg-muted/40 border border-border">
          <p className="text-sm font-semibold text-foreground mb-2">AI Diagnosis</p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{this.props.rawText}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Main Component ────────────────────────────────────────────────────────────
function DiagnosisInner({ diagnosisText, confidence, onSelectedTestsChange }: DiagnosisDisplayProps) {
  const parsed = parseDiagnosis(diagnosisText);
  const [selectedTests, setSelectedTests] = useState<string[]>(parsed.tests);

  const toggleTest = (test: string) => {
    const updated = selectedTests.includes(test)
      ? selectedTests.filter((t) => t !== test)
      : [...selectedTests, test];
    setSelectedTests(updated);
    onSelectedTestsChange(updated);
  };

  const hasStructured = parsed.diagnoses.length > 0 || parsed.tests.length > 0;

  // Fallback: show raw text cleanly if parser couldn't extract structure
  if (!hasStructured) {
    return (
      <div className="space-y-3">
        {confidence != null && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm font-medium">Confidence:</span>
            <Badge variant={confidence > 80 ? 'default' : 'secondary'}>{confidence}%</Badge>
          </div>
        )}
        <div className="p-4 rounded-lg bg-muted/30 border border-border">
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{diagnosisText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm">

      {/* Confidence */}
      {confidence != null && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground font-medium">Confidence:</span>
          <Badge variant={confidence > 80 ? 'default' : 'secondary'}>{confidence}%</Badge>
        </div>
      )}

      {/* Possible Diagnoses */}
      {parsed.diagnoses.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold flex items-center gap-2 text-foreground">
            <Activity className="w-4 h-4 text-primary" />Possible Diagnoses
          </h3>
          <div className="space-y-2">
            {parsed.diagnoses.map((d) => (
              <div key={d.rank} className="flex gap-3 p-2 rounded-md bg-muted/40 border border-border">
                <span className={`font-bold text-base shrink-0 ${rankColors[d.rank - 1] ?? rankColors[4]}`}>{d.rank}.</span>
                <div>
                  <span className="font-semibold text-foreground">{d.name}</span>
                  {d.description && <p className="text-muted-foreground mt-0.5 leading-snug">{d.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommended Tests */}
      {parsed.tests.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold flex items-center gap-2 text-foreground">
            <FlaskConical className="w-4 h-4 text-primary" />
            Recommended Tests
            <span className="text-xs text-muted-foreground font-normal ml-1">({selectedTests.length}/{parsed.tests.length} selected)</span>
          </h3>
          <div className="space-y-2">
            {parsed.tests.map((test) => (
              <label key={test} className="flex items-start gap-3 p-2 rounded-md border border-border bg-muted/40 cursor-pointer hover:bg-accent transition-colors">
                <Checkbox checked={selectedTests.includes(test)} onCheckedChange={() => toggleTest(test)} className="mt-0.5 shrink-0" />
                <span className={`leading-snug ${selectedTests.includes(test) ? 'text-foreground' : 'text-muted-foreground line-through'}`}>{test}</span>
              </label>
            ))}
          </div>
          {selectedTests.length === 0 && <p className="text-xs text-muted-foreground italic">Select at least one test to schedule</p>}
        </div>
      )}

      {/* Urgency */}
      {parsed.urgency && (() => {
        const cfg = urgencyConfig[urgencyLevel(parsed.urgency)];
        return (
          <div className="space-y-1">
            <h3 className="font-semibold flex items-center gap-2 text-foreground">
              <AlertTriangle className="w-4 h-4 text-destructive" />Urgency
            </h3>
            <div className={`rounded-xl border-2 ${cfg.border} ${cfg.bg} overflow-hidden`}>
              <div className={`flex items-center gap-3 px-4 py-3 border-b ${cfg.border}`}>
                <AlertTriangle className={`w-5 h-5 shrink-0 ${cfg.icon} ${cfg.pulse ? 'animate-pulse' : ''}`} />
                <span className={`text-sm font-bold uppercase tracking-wider ${cfg.text}`}>{cfg.label}</span>
                <span className={`ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full ${cfg.badge}`}>{cfg.label}</span>
              </div>
              <div className={`px-4 py-3 text-sm leading-relaxed ${cfg.text}`}>{parsed.urgency}</div>
            </div>
          </div>
        );
      })()}

      {/* Disclaimer */}
      {parsed.disclaimer && (
        <div className="flex gap-2 p-2 rounded-md bg-muted/30 border border-border text-xs text-muted-foreground">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{parsed.disclaimer}</span>
        </div>
      )}
    </div>
  );
}

// Wrap with error boundary so any render crash shows raw text instead of blank page
export default function DiagnosisDisplay(props: DiagnosisDisplayProps) {
  return (
    <DiagnosisErrorBoundary rawText={props.diagnosisText}>
      <DiagnosisInner {...props} />
    </DiagnosisErrorBoundary>
  );
}
