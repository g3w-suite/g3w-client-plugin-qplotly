const { base, inherit } =  g3wsdk.core.utils;
const GUI = g3wsdk.gui.GUI;
const PluginService = g3wsdk.core.plugin.PluginService;
const QPlotlyComponent = require('component/qplotly');
function Service(){
  base(this);

  this.init = function(options={}){
    const {qgs_layer_id, selected_features_only, visible_features_only } = options;
    this.loadscripts();
  };
  
  this.loadscripts = async function(scripts=['polyfill.min.js','plotly-1.52.2.min.js']){
    for (const script of scripts) {
      const promise = new Promise((resolve, reject) => {
        $.getScript(`/static/qplotly/${script}`)
          .done(() => {
            resolve();
          }).fail(() => {
          reject();
        })
      });
      await promise;
    }
    this.emit('ready');
  };

  this.showChart = function(bool){
    console.log(bool)
    bool && GUI.showContent({
      content: new QPlotlyComponent(),
      perc: 50
    }) || GUI.hideContent(true);
  };

  this.clear = function(){};
}

inherit(Service, PluginService);

module.exports = new Service;

 