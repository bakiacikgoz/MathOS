export type MathWidgetKind="DEPENDENCY_DAG"|"GOAL_STATE"|"FINITE_TABLE"|"COUNTEREXAMPLE"|"NUMERIC_PLOT"|"GEOMETRY_SCENE"
export interface MathWidgetSpec{schemaVersion:"math-widget-v1";id:string;kind:MathWidgetKind;title:string;data:unknown;sourceEntityIds:string[];trustLabel:"STRUCTURAL"|"COMPUTATIONAL"|"EXTERNAL"|"FORMAL"}
