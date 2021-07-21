import pluginConfig from './config';
import MultiPlot from './components/sidebar/multiplot';
const {base, inherit} = g3wsdk.core.utils;
const Plugin = g3wsdk.core.plugin.Plugin;
const Service = require('./service');
const addI18nPlugin = g3wsdk.core.i18n.addI18nPlugin;

const _Plugin = function() {
  base(this);
  this.name = 'qplotly';
  this.init = function() {
    addI18nPlugin({
      name: this.name,
      config: pluginConfig.i18n
    });
    this.setService(Service);
    this.config = this.getConfig();
    this.service.once('ready', () => {
      if (this.registerPlugin(this.config.gid)) {
        this.setupGUI();
        this.setReady(true);
      }
    });
    //inizialize service
    this.service.init(this.config);
  };

  this.setupGUI = function(){
    const vueComponentObject = MultiPlot({
      service : this.service
    });
    this.createSideBarComponent(vueComponentObject,
      {
        id: 'qplotly',
        title: 'plugins.qplotly.title',
        open: false,
        collapsible: true,
        iconConfig: {
          color: 'red',
          icon:'chart-area',
        },
        mobile: true,
        events: {
          open: {
            when: 'before',
            cb: async bool => {
              await this.service.showChart(bool);
              !bool && this.config.plots.forEach(plot => plot.loaded = false);
            }
          }
        },
        sidebarOptions: {
          position: 1
        }
      });
  };

  this.unload = function() {
    this.service.clear();
  }
};

inherit(_Plugin, Plugin);

(function(plugin){
  plugin.init();
})(new _Plugin);
