
// MiLoto Adaptive Engine v2
// Uses full history and recalculates after every update.

function buildAdaptiveWeights(stats){
    const weights={};
    const maxHist=Math.max(...Object.values(stats.gf||{}),1);
    const maxRecent=Math.max(...Object.values(stats.rf||{}),1);

    for(let n=1;n<=39;n++){
        const historical=(stats.gf[n]||0)/maxHist;
        const recent=(stats.rf[n]||0)/maxRecent;
        const absence=Math.min((stats.absence?.[n]||0)/25,1);

        const drift=Math.abs(historical-recent);

        const historicalFactor=drift<0.15 ? 0.75 : 0.45;
        const recentFactor=drift<0.15 ? 0.25 : 0.55;

        weights[n]=(
            historical*historicalFactor +
            recent*recentFactor +
            absence*0.15
        );
    }

    return weights;
}
