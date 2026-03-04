"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

interface Instance {
  id: string;
  name: string;
  year: number;
  venue?: {
    name: string;
  };
}

interface ConfigStepProps {
  fileKey: string;
  onNext: (config: {
    instanceId: string;
    targetType: "SESSION" | "PUBLICATION";
    topK: number;
    searchK: number;
    includeReasons: boolean;
  }) => void;
  onBack: () => void;
  onCancel: () => void;
}

export function ConfigStep({ onNext, onBack, onCancel }: ConfigStepProps) {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [instanceId, setInstanceId] = useState("");
  const [targetType, setTargetType] = useState<"SESSION" | "PUBLICATION">("SESSION");
  const [topK, setTopK] = useState(50);
  const [searchK, setSearchK] = useState(350);
  const [includeReasons, setIncludeReasons] = useState(true);

  useEffect(() => {
    async function loadInstances() {
      try {
        const response = await fetch("/api/explore/instances");
        if (!response.ok) throw new Error("Failed to load instances");
        const data = await response.json();
        setInstances(data);

        // Auto-select first instance
        if (data.length > 0) {
          setInstanceId(data[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load instances");
      } finally {
        setIsLoading(false);
      }
    }

    loadInstances();
  }, []);

  const handleNext = () => {
    if (!instanceId) {
      setError("Please select a conference");
      return;
    }

    onNext({ instanceId, targetType, topK, searchK, includeReasons });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Configure Matching</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Select the conference to match against and configure options.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="space-y-2">
            <Label htmlFor="instance">Conference</Label>
            <Select value={instanceId} onValueChange={setInstanceId}>
              <SelectTrigger id="instance">
                <SelectValue placeholder="Select a conference" />
              </SelectTrigger>
              <SelectContent>
                {instances.map((instance) => (
                  <SelectItem key={instance.id} value={instance.id}>
                    {instance.venue?.name} {instance.year} - {instance.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetType">Match Against</Label>
            <Select
              value={targetType}
              onValueChange={(v) => setTargetType(v as "SESSION" | "PUBLICATION")}
            >
              <SelectTrigger id="targetType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SESSION">Sessions</SelectItem>
                <SelectItem value="PUBLICATION">Publications</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="topK">Top K Results</Label>
              <Input
                id="topK"
                type="number"
                min={1}
                max={100}
                value={topK}
                onChange={(e) => setTopK(parseInt(e.target.value) || 50)}
              />
              <p className="text-xs text-muted-foreground">
                Number of matches per query
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="searchK">Search K</Label>
              <Input
                id="searchK"
                type="number"
                min={10}
                max={500}
                value={searchK}
                onChange={(e) => setSearchK(parseInt(e.target.value) || 350)}
              />
              <p className="text-xs text-muted-foreground">
                Embedding pre-filter size
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="includeReasons"
              checked={includeReasons}
              onCheckedChange={(checked) => setIncludeReasons(checked as boolean)}
            />
            <Label htmlFor="includeReasons" className="font-normal">
              Generate recommendation reasons (slower)
            </Label>
          </div>
        </div>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleNext} disabled={!instanceId || isLoading}>
          Continue
        </Button>
      </div>
    </div>
  );
}
