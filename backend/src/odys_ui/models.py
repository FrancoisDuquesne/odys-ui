from pydantic import BaseModel, field_validator, model_validator


class GeneratorInput(BaseModel):
    name: str
    nominal_power: float
    variable_cost: float


class LoadInput(BaseModel):
    name: str


class StorageInput(BaseModel):
    name: str
    capacity: float
    max_power: float
    soc_start: float = 0.0
    soc_end: float = 0.0


class AssetsInput(BaseModel):
    generators: list[GeneratorInput] = []
    loads: list[LoadInput] = []
    storage: list[StorageInput] = []


class ScenarioInput(BaseModel):
    number_of_steps: int
    timestep_hours: float = 1.0
    load_profiles: dict[str, list[float]]
    available_capacity_profiles: dict[str, list[float]] = {}

    @field_validator("number_of_steps")
    @classmethod
    def steps_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("number_of_steps must be at least 1")
        return v

    @model_validator(mode="after")
    def profiles_match_steps(self) -> "ScenarioInput":
        for name, profile in self.load_profiles.items():
            if len(profile) != self.number_of_steps:
                raise ValueError(
                    f"load profile '{name}' has {len(profile)} values but number_of_steps is {self.number_of_steps}"
                )
        for name, profile in self.available_capacity_profiles.items():
            if len(profile) != self.number_of_steps:
                raise ValueError(
                    f"capacity profile '{name}' has {len(profile)} values but number_of_steps is {self.number_of_steps}"
                )
        return self


class OptimizeRequest(BaseModel):
    assets: AssetsInput
    scenario: ScenarioInput

    @model_validator(mode="after")
    def validate_names_consistent(self) -> "OptimizeRequest":
        gen_names = {g.name for g in self.assets.generators}
        load_names = {l.name for l in self.assets.loads}
        storage_names = {s.name for s in self.assets.storage}

        for name in self.scenario.load_profiles:
            if name not in load_names:
                raise ValueError(f"load profile '{name}' does not match any Load asset")

        for name in self.scenario.available_capacity_profiles:
            if name in storage_names:
                raise ValueError(
                    f"capacity profile '{name}' is a Storage asset — odys does not support per-timestep capacity for storage"
                )
            if name not in gen_names:
                raise ValueError(
                    f"capacity profile '{name}' does not match any Generator asset"
                )

        if not self.assets.generators and not self.assets.storage:
            raise ValueError("at least one Generator or Storage asset is required")
        if not self.assets.loads:
            raise ValueError("at least one Load asset is required")

        return self


class GeneratorResult(BaseModel):
    name: str
    power: list[float]


class StorageResult(BaseModel):
    name: str
    net_power: list[float]
    soc: list[float]


class OptimizeResponse(BaseModel):
    status: str
    objective_value: float | None = None
    timesteps: list[int]
    generators: list[GeneratorResult] = []
    storages: list[StorageResult] = []
    message: str | None = None
