from datetime import timedelta

from odys import AssetPortfolio, EnergySystem, Generator, Load, Scenario, Storage
from odys.domain.exceptions import OdysValidationError

from .models import OptimizeRequest, OptimizeResponse, GeneratorResult, StorageResult


def run_optimization(req: OptimizeRequest) -> OptimizeResponse:
    generators = [
        Generator(name=g.name, nominal_power=g.nominal_power, variable_cost=g.variable_cost)
        for g in req.assets.generators
    ]
    loads = [Load(name=l.name) for l in req.assets.loads]
    storage_assets = [
        Storage(
            name=s.name,
            capacity=s.capacity,
            max_power=s.max_power,
            soc_start=s.soc_start,
            soc_end=s.soc_end,
        )
        for s in req.assets.storage
    ]

    portfolio = AssetPortfolio(generators + loads + storage_assets)
    scenario = Scenario(
        load_profiles=req.scenario.load_profiles,
        available_capacity_profiles=req.scenario.available_capacity_profiles,
    )
    timesteps = list(range(req.scenario.number_of_steps))

    try:
        energy_system = EnergySystem(
            portfolio=portfolio,
            scenarios=scenario,
            timestep=timedelta(hours=req.scenario.timestep_hours),
            number_of_steps=req.scenario.number_of_steps,
        )
        result = energy_system.optimize()
    except OdysValidationError as e:
        return OptimizeResponse(
            status="infeasible",
            timesteps=timesteps,
            message=str(e),
        )

    if result.objective_value is None:
        return OptimizeResponse(
            status="infeasible",
            timesteps=timesteps,
            message="No feasible solution found. Check that total generation capacity can meet the load.",
        )

    # Serialize generator dispatch — power Series has MultiIndex (time, generator)
    gen_results: list[GeneratorResult] = []
    if req.assets.generators:
        power_series = result.generators.power
        gen_names = power_series.index.get_level_values("generator").unique().tolist()
        for name in gen_names:
            power_values = power_series.xs(name, level="generator").tolist()
            gen_results.append(GeneratorResult(name=name, power=power_values))

    # Serialize storage dispatch — net_power and soc both have MultiIndex (time, storage)
    storage_results: list[StorageResult] = []
    if req.assets.storage:
        net_power_series = result.storages.net_power
        soc_series = result.storages.soc
        storage_names = net_power_series.index.get_level_values("storage").unique().tolist()
        for name in storage_names:
            net_power = net_power_series.xs(name, level="storage").tolist()
            soc = soc_series.xs(name, level="storage").tolist()
            storage_results.append(StorageResult(name=name, net_power=net_power, soc=soc))

    # objective_value is negated internally (maximizing -cost), so negate it back for display
    total_cost = -result.objective_value

    return OptimizeResponse(
        status="optimal",
        objective_value=total_cost,
        timesteps=timesteps,
        generators=gen_results,
        storages=storage_results,
    )
