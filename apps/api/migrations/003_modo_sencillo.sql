-- Modo sencillo: muestra solo lo esencial para tramos y negocios pequeños
ALTER TABLE companies ADD COLUMN simple_mode boolean NOT NULL DEFAULT true;
