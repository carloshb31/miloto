
// Adaptive Engine v1.0
// Uses full history and recalculates after every update.

function buildAdaptiveWeights(STATS){
  const weights={};
  const maxG=Math.max(...Object.values(STATS.gf||{1:1}));
  const maxR=Math.max(...Object.values(STATS.rf||{1:1}),1);

  for(let n=1;n<=39;n++){
    const hist=(STATS.gf[n]||0)/maxG;
    const recent=(STATS.rf[n]||0)/maxR;
    const absence=Math.min((STATS.absence?.[n]||0)/20,1);

    const drift=Math.abs(hist-recent);
    const histWeight=drift<0.15?0.75:0.45;
    const recentWeight=drift<0.15?0.25:0.55;

    weights[n]=(hist*histWeight)+(recent*recentWeight)+(absence*0.15);
  }
  return weights;
}
