export interface GeneratorInput {
  id: string;
  name: string;
  nominal_power: number;
  variable_cost: number;
}

export interface LoadInput {
  id: string;
  name: string;
}

export interface StorageInput {
  id: string;
  name: string;
  capacity: number;
  max_power: number;
  soc_start: number;
  soc_end: number;
}

export interface AssetsState {
  generators: GeneratorInput[];
  loads: LoadInput[];
  storage: StorageInput[];
}

export interface ScenarioState {
  number_of_steps: number;
  timestep_hours: number;
  load_profiles: Record<string, number[]>;
  available_capacity_profiles: Record<string, number[]>;
}

// API request/response shapes (matching backend models)
export interface OptimizeRequest {
  assets: {
    generators: Omit<GeneratorInput, 'id'>[];
    loads: Omit<LoadInput, 'id'>[];
    storage: Omit<StorageInput, 'id'>[];
  };
  scenario: ScenarioState;
}

export interface GeneratorResult {
  name: string;
  power: number[];
}

export interface StorageResult {
  name: string;
  net_power: number[];
  soc: number[];
}

export interface OptimizeResponse {
  status: 'optimal' | 'infeasible' | 'error';
  objective_value: number | null;
  timesteps: number[];
  generators: GeneratorResult[];
  storages: StorageResult[];
  message: string | null;
}
