import { useState } from 'react';
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
  rawRest: string;
}

// Parse the markdown-style diagnosis text into structured data
function parseDiagnosis(text: string): ParsedDiagnosis {
  const result: ParsedDiagnosis = {
    diagnoses: [],
    tests: [],
    urgency: '',
    disclaimer: '',
    rawRest: '',
  };

  // Split into lines for processing
  const lines = text.split('\n');
  let currentSection = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect section headers (### 1. / **1.** / 1. style)
    if (/###?\s*\d+\.\s*(possible\s*diagnos|diagnos)/i.test(line) || /^\*{0,2}\d+\.\s*(possible\s*diagnos)/i.test(line)) {
      currentSection = 'diagnoses';
      continue;
    }
    if (/###?\s*\d+\.\s*(confidence)/i.test(line) || /confidence\s*level/i.test(line)) {
      currentSection = 'confidence';
      continue;
    }
    if (/###?\s*\d+\.\s*(recommended|medical\s*test)/i.test(line) || /recommended\s*.*test/i.test(line)) {
      currentSection = 'tests';
      continue;
    }
    if (/###?\s*\d+\.\s*(urgency)/i.test(line) || /urgency\s*assessment/i.test(line)) {
      currentSection = 'urgency';
      continue;
    }
    if (/^\*?disclaimer/i.test(line) || /^\*this analysis/i.test(line)) {
      currentSection = 'disclaimer';
    }

    if (!line) continue;

    if (currentSection === 'diagnoses') {
      // Match numbered diagnosis lines: "1. **Name:** description" or "1. **Name**"
      const match = line.match(/^\*{0,2}(\d+)\.\*{0,2}\s+\*{0,2}([^:*]+)\*{0,2}:?\s*(.*)/);
      if (match) {
        result.diagnoses.push({
          rank: parseInt(match[1]),
          name: match[2].replace(/\*\*/g, '').trim(),
          description: match[3].replace(/\*\*/g, '').trim(),
        });
      }
    } else if (currentSection === 'tests') {
      // Match bullet test lines: "* **Test Name:** description" or "- **Test Name:**"
      const match = line.match(/^[-*•]\s+\*{0,2}([^:*]+)\*{0,2}:?\s*(.*)/);
      if (match) {
        const testName = match[1].replace(/\*\*/g, '').trim();
        if (testName.length > 2) result.tests.push(testName);
      }
    } else if (currentSection === 'urgency') {
      result.urgency += (result.urgency ? ' ' : '') + line.replace(/\*\*/g, '').trim();
    } else if (currentSection === 'disclaimer') {
      result.disclaimer += (result.disclaimer ? ' ' : '') + line.replace(/[*_]/g, '').trim();
    }
  }

  return result;
}

const urgencyLevel = (text: string): 'emergency' | 'urgent' | 'moderate' | 'low' => {
  const lower = text.toLowerCase();
  if (lower.includes('emergency') || lower.includes('immediate') || lower.includes('critical')) return 'emergency';
  if (lower.includes('urgent') || lower.includes('high')) return 'urgent';
  if (lower.includes('moderate') || lower.includes('medium')) return 'moderate';
  return 'low';
};

const urgencyConfig = {
  emergency: {
    bg:     'bg-red-50',
    border: 'border-red-400',
    text:   'text-red-800',
    badge:  'bg-red-600 text-white',
    icon:   'text-red-600',
    pulse:  true,
    label:  'EMERGENCY',
  },
  urgent: {
    bg:     'bg-orange-50',
    border: 'border-orange-400',
    text:   'text-orange-800',
    badge:  'bg-orange-500 text-white',
    icon:   'text-orange-500',
    pulse:  false,
    label:  'URGENT',
  },
  moderate: {
    bg:     'bg-yellow-50',
    border: 'border-yellow-300',
    text:   'text-yellow-800',
    badge:  'bg-yellow-400 text-yellow-900',
    icon:   'text-yellow-600',
    pulse:  false,
    label:  'Moderate',
  },
  low: {
    bg:     'bg-green-50',
    border: 'border-green-300',
    text:   'text-green-800',
    badge:  'bg-green-500 text-white',
    icon:   'text-green-600',
    pulse:  false,
    label:  'Low',
  },
};

const rankColors = ['text-red-500', 'text-orange-500', 'text-yellow-500', 'text-blue-500', 'text-muted-foreground'];

export default function DiagnosisDisplay({ diagnosisText, confidence, onSelectedTestsChange }: DiagnosisDisplayProps) {
  const parsed = parseDiagnosis(diagnosisText);
  const [selectedTests, setSelectedTests] = useState<string[]>(parsed.tests); // all selected by default

  const toggleTest = (test: string) => {
    const updated = selectedTests.includes(test)
      ? selectedTests.filter((t) => t !== test)
      : [...selectedTests, test];
    setSelectedTests(updated);
    onSelectedTestsChange(updated);
  };

  // If parsing didn't extract structured data, fall back to raw text
  const hasStructured = parsed.diagnoses.length > 0 || parsed.tests.length > 0;

  if (!hasStructured) {
    return (
      <div className="prose prose-sm max-w-none">
        <p className="whitespace-pre-wrap text-foreground text-sm">{diagnosisText}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm">

      {/* Confidence badge */}
      {confidence && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground font-medium">Confidence:</span>
          <Badge variant={confidence > 80 ? 'default' : 'secondary'}>{confidence}%</Badge>
        </div>
      )}

      {/* Possible Diagnoses */}
      {parsed.diagnoses.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold flex items-center gap-2 text-foreground">
            <Activity className="w-4 h-4 text-primary" />
            Possible Diagnoses
          </h3>
          <div className="space-y-2">
            {parsed.diagnoses.map((d) => (
              <div key={d.rank} className="flex gap-3 p-2 rounded-md bg-muted/40 border border-border">
                <span className={`font-bold text-base shrink-0 ${rankColors[d.rank - 1] || rankColors[4]}`}>
                  {d.rank}.
                </span>
                <div>
                  <span className="font-semibold text-foreground">{d.name}</span>
                  {d.description && (
                    <p className="text-muted-foreground mt-0.5 leading-snug">{d.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommended Tests with checkboxes */}
      {parsed.tests.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold flex items-center gap-2 text-foreground">
            <FlaskConical className="w-4 h-4 text-primary" />
            Recommended Tests
            <span className="text-xs text-muted-foreground font-normal ml-1">
              ({selectedTests.length}/{parsed.tests.length} selected)
            </span>
          </h3>
          <div className="space-y-2">
            {parsed.tests.map((test) => (
              <label
                key={test}
                className="flex items-start gap-3 p-2 rounded-md border border-border bg-muted/40 cursor-pointer hover:bg-accent transition-colors"
              >
                <Checkbox
                  checked={selectedTests.includes(test)}
                  onCheckedChange={() => toggleTest(test)}
                  className="mt-0.5 shrink-0"
                />
                <span className={`leading-snug ${selectedTests.includes(test) ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                  {test}
                </span>
              </label>
            ))}
          </div>
          {selectedTests.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Select at least one test to schedule</p>
          )}
        </div>
      )}

      {/* Urgency */}
      {parsed.urgency && (
        <div className="space-y-1">
          <h3 className="font-semibold flex items-center gap-2 text-foreground">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            Urgency
          </h3>
          {(() => {
            const level = urgencyLevel(parsed.urgency);
            const cfg   = urgencyConfig[level];
            return (
              <div className={`rounded-xl border-2 ${cfg.border} ${cfg.bg} overflow-hidden`}>
                {/* Header strip */}
                <div className={`flex items-center gap-3 px-4 py-3 border-b ${cfg.border}`}>
                  <AlertTriangle className={`w-5 h-5 shrink-0 ${cfg.icon} ${cfg.pulse ? 'animate-pulse' : ''}`} />
                  <span className={`text-sm font-bold uppercase tracking-wider ${cfg.text}`}>{cfg.label}</span>
                  <span className={`ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                </div>
                {/* Body */}
                <div className={`px-4 py-3 text-sm leading-relaxed ${cfg.text}`}>
                  {parsed.urgency}
                </div>
              </div>
            );
          })()}
        </div>
      )}

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
