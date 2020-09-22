import pluginConfig from './config';
const inherit = g3wsdk.core.utils.inherit;
const base = g3wsdk.core.utils.base;
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
      this.setupGUI();
      this.setReady(true);
    });
    //inizialize service
    this.service.init(this.config);
  };

  this.setupGUI = function(){
   this.service.createSideBarComponent();
  };

  this.unload = function() {
    this.service.clear()
  }
};

inherit(_Plugin, Plugin);

(function(plugin){
  plugin.init();
})(new _Plugin);
