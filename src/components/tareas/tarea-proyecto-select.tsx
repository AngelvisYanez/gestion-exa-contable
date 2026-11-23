import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { TAREA_PROYECTOS, esTareaProyecto, type TareaProyecto } from "@/lib/tarea-proyectos";

type Props = {
  id: string;
  value: TareaProyecto | null;
  onChange: (proyecto: TareaProyecto | null) => void;
  disabled?: boolean;
};

export function TareaProyectoSelect({ id, value, onChange, disabled }: Props) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Proyecto</Label>
      <Select
        id={id}
        value={value ?? ""}
        onChange={(event) => {
          const proyecto = event.target.value;
          onChange(esTareaProyecto(proyecto) ? proyecto : null);
        }}
        disabled={disabled}
      >
        <option value="">Sin proyecto</option>
        {Object.entries(TAREA_PROYECTOS).map(([id, nombre]) => (
          <option key={id} value={id}>{nombre}</option>
        ))}
      </Select>
    </div>
  );
}
