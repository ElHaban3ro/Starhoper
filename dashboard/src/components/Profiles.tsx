import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useTelemetry } from '@/store/telemetry'
import { useWs } from '@/store/ws'
import { Plus, Save, RotateCcw, Trash2 } from 'lucide-react'

export function Profiles() {
  const profiles = useTelemetry((s) => s.profiles)
  const config = useTelemetry((s) => s.config)
  const send = useWs((s) => s.send)

  const [current, setCurrent] = useState<string>('')
  const [newName, setNewName] = useState('')
  const [newOpen, setNewOpen] = useState(false)

  const isReadonly = !!profiles.find((p) => p.name === current)?.readonly

  const onSelect = (name: string) => {
    setCurrent(name)
    send({ type: 'apply_profile', name })
  }

  const onSave = () => {
    if (!current || isReadonly) return
    send({ type: 'save_profile', name: current, data: config })
  }

  const onReload = () => {
    if (!current) return
    send({ type: 'apply_profile', name: current })
  }

  const onCreate = () => {
    const name = newName.trim()
    if (!/^[A-Za-z0-9_\-]{1,32}$/.test(name) || name === 'default') return
    send({ type: 'save_profile', name, data: config })
    setNewName('')
    setNewOpen(false)
    setTimeout(() => setCurrent(name), 50)
  }

  const onDelete = () => {
    if (!current || isReadonly) return
    send({ type: 'delete_profile', name: current })
    setCurrent('')
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Label className="text-xs">Profile</Label>
        <Select value={current} onValueChange={onSelect}>
          <SelectTrigger className="w-[220px] h-9">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {profiles.map((p) => (
              <SelectItem key={p.name} value={p.name}>
                {p.name} {p.readonly && <span className="text-[9px] text-warning ml-1">ro</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {current && isReadonly && (
          <Badge variant="outline" className="text-[9px] uppercase border-warning/40 text-warning">
            readonly
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="secondary" onClick={onSave} disabled={!current || isReadonly}>
          <Save className="h-3.5 w-3.5 mr-1" /> Save
        </Button>
        <Button size="sm" variant="secondary" onClick={onReload} disabled={!current}>
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reload
        </Button>

        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-3.5 w-3.5 mr-1" /> New
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Clone current config to new profile</DialogTitle>
            </DialogHeader>
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="profile name (A-Z0-9_-, ≤32)"
            />
            <DialogFooter>
              <Button variant="secondary" onClick={() => setNewOpen(false)}>Cancel</Button>
              <Button onClick={onCreate}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="destructive" disabled={!current || isReadonly}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete profile “{current}”?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        <b>Selecting a profile auto-loads</b> it into the live controller. Sliders edit the live config only;
        press <b>Save</b> to write current values back. <b>Reload</b> restores from disk. Built-ins
        (<code className="font-mono text-foreground">default, quad, rocket, agile</code>) are readonly — clone via <b>New</b> to edit.
      </p>
    </div>
  )
}
