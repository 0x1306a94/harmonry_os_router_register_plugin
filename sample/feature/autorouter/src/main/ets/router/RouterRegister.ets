export class RouterRegister {
  private static getBuilderMap(): Map<string, WrappedBuilder<[object]>> {
    let map: Map<string, WrappedBuilder<[object]>> =
      AppStorage.get('RouterRegister.builderMap') as Map<string, WrappedBuilder<[object]>>;
    if (!map) {
      let builderMap: Map<string, WrappedBuilder<[object]>> = new Map<string, WrappedBuilder<[object]>>();
      AppStorage.setOrCreate('RouterRegister.builderMap', builderMap);
      return builderMap;
    }
    return map;
  }

  public static registerBuilder(name: string, builder: WrappedBuilder<[object]>) {
    RouterRegister.getBuilderMap().set(name, builder);
  }

  public static getBuilder(name: string): WrappedBuilder<[object]> {
    const builder = RouterRegister.getBuilderMap().get(name) as WrappedBuilder<[object]>;
    if (!builder) {
      throw new Error(`${name} builder not found`);
    }
    return builder;
  }
}