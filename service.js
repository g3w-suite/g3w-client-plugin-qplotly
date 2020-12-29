import { charts as chartsConfig } from './config/app'
import MultiPlot from './components/sidebar/multiplot';
const { base, inherit, XHR ,debounce} =  g3wsdk.core.utils;
const GUI = g3wsdk.gui.GUI;
const ComponentsFactory = g3wsdk.gui.ComponentsFactory;
const PluginService = g3wsdk.core.plugin.PluginService;
const QPlotlyComponent = require('./components/content/qplotly');
let BASEQPLOTLYAPIURL = '/qplotly/api/trace';


function Service(){
  base(this);
  this.mapService = GUI.getComponent('map').getService();
  this.loadedplots = {};
  this.loading = false;
  this.state = Vue.observable({
    loading: false
  });
  this.init = function(config={}){
   this.config = config;
   const layersId = new Set();
   this.chartContainers = [];
   this.config.plots.forEach((plot, index)=>{
     plot.show = index === 0;
     plot.label = plot.plot.layout.title ||  `Plot id [${plot.id}]`;
     // set automargin
     plot.plot.layout.xaxis.automargin = true;
     plot.plot.layout.yaxis.automargin = true;
     //end automargin
     layersId.add(plot.qgs_layer_id);
   });
   BASEQPLOTLYAPIURL = `${BASEQPLOTLYAPIURL}/${this.getGid()}`;
   this.loadscripts();
   const queryResultService = GUI.getComponent('queryresults').getService();
   this.showChartsOnContainer = (ids, container) => {
     const find = this.chartContainers.find(queryresultcontainer => container.selector === queryresultcontainer.container.selector);
     !find && this.chartContainers.push({
       container,
       component: null
     });
     this.showChart(!find, ids, container);
   };

   this.clearChartContainers = container => {
     this.chartContainers = this.chartContainers.filter(queryResultsContainer =>  {
       if (!container || (container.selector === queryResultsContainer.container.selector)) {
           $(queryResultsContainer.component.$el).remove();
           queryResultsContainer.component.$destroy();
          return false
         } else return true;
     });
   };

   queryResultService.addLayersPlotIds([...layersId]);
   queryResultService.on('show-chart', this.showChartsOnContainer);
   queryResultService.on('hide-chart', this.clearChartContainers);
   this.closeComponentKeyEevent = queryResultService.onafter('closeComponent', this.clearChartContainers)
  };

  this.createSideBarComponent = function(){
    const vueComponentObject = MultiPlot({
      service : this
    });
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
    const options = {
      position: 1
    };

    GUI.addComponent(QPlotlySiderBarComponent, 'sidebar', options);

    this.mapService.on('mapcontrol:active', ()=>{
      if (QPlotlySiderBarComponent.getOpen()) {
        QPlotlySiderBarComponent.click({
          open: false
        });
      }
    });

    this.once('clear', () => {
      GUI.removeComponent('qplotly', 'sidebar', options)
    })
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
    const id = plot.id;
    const type = plot.plot.type;
    if (chartsConfig.no_subplots.indexOf(type) !== -1) {
      this.config.plots.forEach(plot => {
        if (plot.id !== id)  plot.show = false
      })
    } else {
      this.config.plots.forEach(plot => {
        if (chartsConfig.no_subplots.indexOf(plot.plot.type) !== -1)  plot.show = false
      })
    }
    await this.getChartsAndEmit();
  };

  this.getChartsAndEmit = async function(){
    const charts = await this.getCharts();
    this.emit('change-charts', charts);
  };

  this.hidePlot = async function(){
   await this.getChartsAndEmit();
  };

  this.getPlots = function(){
    return this.config.plots;
  };

  this.clearLoadedPlots = function () {
    this.loadedplots = {};

  };

  this.getCharts = async function(ids){
    this.state.loading = true;
    !ids && await GUI.setLoadingContent(true);
    const promise =  new Promise((resolve, reject) => {
      const charts = {
        data:[],
        layout:[]
      };
      const promises = [];
      const plots =  ids ? this.config.plots.filter(plot => ids.indexOf(plot.qgs_layer_id) !== -1) :this.config.plots.filter(plot => plot.show);
      if (Promise.allSettled) {
       plots.forEach(plot => {
         const promise = this.loadedplots[plot.id] ? Promise.resolve(this.loadedplots[plot.id]) : XHR.get({url: `${BASEQPLOTLYAPIURL}/${plot.id}`});
         promises.push(promise)
        });
        Promise.allSettled(promises)
          .then(async promisesData=>{
            promisesData.forEach((promise, index) =>{
              if (promise.status === 'fulfilled' && promise.value.result) {
                const data = promise.value.data;
                const plot = plots[index];
                this.loadedplots[plot.id] = {
                  result: true,
                  data
                };
                charts.data.push(data[0]) ;
                charts.layout.push(plot.plot.layout)
              }
            });
            resolve(charts);
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
    });
    try {
      await promise;
    } catch (e) {
    } finally {
      !ids && await GUI.setLoadingContent(false);
      this.state.loading = false;
    }
    return promise;
  };

  this.getChartLayout = function (id) {
    return this.config.plots[0].layout;
  };

  this.getChartConfig = function(id){
    return this.config.plots[0].config;
  };

  this.showChart = function(bool, ids, container){
    if (bool) {
      setTimeout(()=>{
        //this.mapService.deactiveMapControls();
        const content =  new QPlotlyComponent({
          service: this,
          ids
        });
        if (container) {
          const component = content.getInternalComponent();
          component.$once('hook:mounted', async function(){
            container.append(this.$el);
            GUI.emit('resize');
          });
          component.$mount();
          this.chartContainers.find(queryResultsContainer => container.selector === queryResultsContainer.container.selector).component = component;
        } else
          GUI.showContent({
            closable: false,
            title: 'plugins.qplotly.title',
            content,
            perc: 50
          });
      }, 300)
    } else {
      if (container)
        this.clearChartContainers(container);
      else this.mapService.activeMapControl('query') || GUI.closeContent();
    }
  };

  this.clear = function(){
    this.emit('clear');
    this.mapService = null;
    this.chartContainers = [];
    const queryResultService = GUI.getComponent('queryresults').getService();
    queryResultService.removeListener('show-charts', this.showChartsOnContainer);
    queryResultService.un('closeComponent', this.closeComponentKeyEevent);
    this.closeComponentKeyEevent = null;
    GUI.closeContent();
  };
}

inherit(Service, PluginService);

module.exports = new Service;

 