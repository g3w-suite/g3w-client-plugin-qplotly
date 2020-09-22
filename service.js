import MultiPlot from './components/sidebar/multiplot';
const { base, inherit, XHR } =  g3wsdk.core.utils;
const GUI = g3wsdk.gui.GUI;
const ComponentsFactory = g3wsdk.gui.ComponentsFactory;
const PluginService = g3wsdk.core.plugin.PluginService;
const QPlotlyComponent = require('./components/content/qplotly');
let BASEQPLOTLYAPIURL = '/qplotly/api/trace';

function Service(){
  base(this);
  this.mapService = GUI.getComponent('map').getService();
  this.init = function(config={}){
   this.config = config;
   ///temp
   const plot2 = JSON.parse(JSON.stringify(this.config.plots[0]));
   plot2.id = 2;
   this.config.plots = [this.config.plots[0], plot2]
   this.config.plots.forEach((plot, index)=>{
     plot.show = index === 0;
   });
   BASEQPLOTLYAPIURL = `${BASEQPLOTLYAPIURL}/${this.getGid()}`;
   this.loadscripts();
  };
  
  this.createSideBarComponent = function(){
    const vueComponentObject = this.config.plots.length > 1 ?  MultiPlot({
      service : this
    }): undefined ;
    const QPlotlySiderBarComponent = ComponentsFactory.build(
      {
        vueComponentObject
      },
      {
        id: 'qplotly',
        title: 'plugins.qplotly.title',
        open: false,
        collapsible: true,
        iconColor: 'red',
        icon: GUI.getFontClass('chart-area'),
        mobile: true,
        events: {
          open: {
            when: 'before',
            cb: bool => this.showChart(bool)
          }
        }
      }
    );

    GUI.addComponent(QPlotlySiderBarComponent, 'sidebar', {
      position: 1
    });

    this.mapService.on('mapcontrol:active', ()=>{
      if (QPlotlySiderBarComponent.getOpen()) {
        QPlotlySiderBarComponent.setOpen(false);
        QPlotlySiderBarComponent.click();
      }
    });
  };

  //remove scripts
  this.unloadscripts = function(){
    for (const script of this.config.jsscripts) {

    }
  };

  //load scripts from server
  this.loadscripts = async function(){
    for (const script of this.config.jsscripts) {
      const promise = new Promise((resolve, reject) => {
        $.getScript(script)
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

  this.showPlot = async function(plot){
    plot.show = true;
    const charts = await this.getCharts();
    this.emit('change-charts', charts);
  };

  this.hidePlot = function(plot){
    plot.show = false;
  };

  this.getPlots = function(){
    return this.config.plots;
  };

  this.getCharts = function(){
    return new Promise((resolve, reject) => {
      const charts = {
        data:[],
        layout:[]
      };
      const promises = [];
      //get anly plot show
      const plots =  this.config.plots.filter(plot => plot.show);
      if (Promise.allSettled) {
       plots.forEach(plot => {
          promises.push(XHR.get({url: `${BASEQPLOTLYAPIURL}/${1}`}))
        });
        Promise.allSettled(promises).then(promisesData=>{
          promisesData.forEach((promise, index) =>{
            if (promise.status === 'fulfilled') {
              promise.value.result && charts.data.push(promise.value.data) ;
              charts.layout.push(plots[index].layout)
            }
          });
          resolve(charts)
        })
      } else {
        plots.forEach( async (plot, index) => {
          try {
            const response = await XHR.get({url: `${BASEQPLOTLYAPIURL}/${plot.id}`});
            response.result && charts.data.push(response.data);
            charts.layout.push(plots[index].layout)
          } catch(err){}
        });
        resolve(charts);
      }
    })
  };

  this.getChartLayout = function (id) {
    return this.config.plots[0].layout;
  };

  this.getChartConfig = function(id){
    return this.config.plots[0].config;
  };

  this.showChart = function(bool){
    bool && setTimeout(()=>{
      this.mapService.deactiveMapControls();
      GUI.showContent({
        closable: false,
        content: new QPlotlyComponent({
          service: this
        }),
        perc: 50
      })
    }, 300) || this.mapService.activeMapControl('query') || GUI.closeContent();
  };

  this.clear = function(){
    this.dataloaded = null;
    this.unloadscripts();
    this.mapService = null;
    GUI.closeContent();
  };
}

inherit(Service, PluginService);

module.exports = new Service;

 