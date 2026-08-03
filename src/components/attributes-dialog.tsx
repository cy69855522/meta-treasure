"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AttributesDialog({
  open,
  onOpenChange,
  attributes,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attributes: Record<string, string>;
  onSave: (attributes: Record<string, string>) => void;
}) {
  const [local, setLocal] = useState(attributes);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) {
      setLocal(attributes);
      setKey("");
      setValue("");
    }
  }, [open, attributes]);

  function addAttribute() {
    if (!key.trim()) return;
    setLocal((prev) => ({ ...prev, [key.trim()]: value }));
    setKey("");
    setValue("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[70] max-w-md"
        overlayClassName="z-[60]"
      >
        <DialogHeader>
          <DialogTitle>自定义属性</DialogTitle>
          <DialogDescription>
            按项目记录 Key-Value，例如 Prompt、ROI、供应商链接等。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex min-h-10 flex-wrap gap-1.5">
            {Object.keys(local).length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无属性</p>
            ) : (
              Object.entries(local).map(([k, v]) => (
                <Badge key={k} variant="outline">
                  {k}: {v}
                  <button
                    type="button"
                    className="ml-1 opacity-60 hover:opacity-100"
                    onClick={() =>
                      setLocal((prev) => {
                        const next = { ...prev };
                        delete next[k];
                        return next;
                      })
                    }
                  >
                    ×
                  </button>
                </Badge>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <Input
              placeholder="value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <Button type="button" variant="secondary" onClick={addAttribute}>
              添加
            </Button>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                onSave(local);
                onOpenChange(false);
              }}
            >
              应用
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
