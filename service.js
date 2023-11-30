import HeaderContentAction from './components/content/headeraction.vue';
import QPlotly             from './components/content/qplotly.vue';

const {
    base,
    inherit,
    XHR,
    debounce,
    toRawType,
}                                     = g3wsdk.core.utils;
const { GUI }                         = g3wsdk.gui;
const { ApplicationState }            = g3wsdk.core;
const { PluginService }               = g3wsdk.core.plugin;
const { CatalogLayersStoresRegistry } = g3wsdk.core.catalog;
const Component                       = g3wsdk.gui.vue.Component;

/**
 * @param { Object } options
 * @param options.service
 * @param options.ids
 * @param options.relationData
 */
function QPlotlyComponent(options = {}) {
  base(this, options);
  this.title              = "qplotly";
  this.state.visible      = true;
  const InternalComponent = Vue.extend(QPlotly);
  this.internalComponent  = new InternalComponent(options);
}
inherit(QPlotlyComponent, Component);

let BASEQPLOTLYAPIURL = '/qplotly/api/trace';

function Service() {

  base(this);

  /**
   * Map Service
   */
  this.mapService = GUI.getService('map');

  /**
   * Query Service 
   */
  this.queryResultService = GUI.getService('queryresults');

  /**
   * Current map CRS
   */
  this.mapCrs = this.mapService.getCrs();

  /**
   * Loaded plots (default: empty Object)
   */
  this.loadedplots = {};

  /**
   * default: false 
   */
  this.loading = false;

  /**
   * default: false
   */ 
  this.showCharts = false;

  /**
   * State of plugin (Vue.observable)
   */
  this.state = Vue.observable({
    loading: false, // loading purpose
    geolayer: false,
    positions: [],
    tools: {
      map: {
        toggled: false,
        disabled: false,
      },
    },
  });

  /**
   * Relation data
   */
  this.relationData = null;

  /**
   * @FIXME add description
   */
  this._relationIdName = {};

  /**
   * @FIXME add description
   */
  this.customParams = {
    bbox: undefined,
  };

  /**
   * Openlayers key event for map `moveend`
   */
  this.keyMapMoveendEvent = {
    key: null,
    plotIds: [],
  };

  /**
   * @FIXME add description
   */
  this.mainbboxtool = false;

  const layersId = new Set();

  /**
   * init service method
   * 
   * @fires ready
   * @listens queryresults~show-chart
   * @listens queryresults~hide-chart
   * @listens queryresults~closeComponent
   */
  this.init = function(config = {}) {

    /**
     * Plugin config
     */
    this.config = config;

    /**
     * Charts container coming from query results
     */
    this.chartContainers = [];

    /**
     * Event handler of change chart
     *  
     * @param layerId passed by filter token (add or remove to a specific layer)
     */
    this.changeChartsEventHandler = debounce(async ({ layerId }) => {

      // change if one of these condition is true
      const change = (
        (true === this.showCharts) &&
        (undefined === this.relationData) &&
        ("undefined" !== this.config.plots.find(plot => this.customParams.bbox || (plot.qgs_layer_id === layerId && true === plot.show)))
      );

      // skip when ..
      if (true !== change) {
        return;
      }

      // in case of a filter is change on showed chart it redraw the chart

      const plotreload = [];                                                        // array of plot to reload
      const isTherePlotListensMoveEnd = this.keyMapMoveendEvent.plotIds.length > 0; // check if there is a plot that need to update data when move map

      // there is a plot
      if (true === isTherePlotListensMoveEnd) {
        this.keyMapMoveendEvent.plotIds.forEach(plotId => {
          const plot = this.config.plots.find(plot => plot.id === plotId.id);
          plot.filters = [];
          plotreload.push(plot); // add plot to plot reaload
        });
      }

      this.setBBoxParameter(isTherePlotListensMoveEnd);

      // whether filtertoken is added or removed from layer
      if (layerId) {
        this.getShowPlots(true).forEach(plot => {
          if (plot.qgs_layer_id === layerId) {
            plotreload.push(plot);
          }
        });
      }

      // redraw the chart
      try {
        let plotIds;
        if (plotreload.length > 0) {
          plotIds = plotreload.map((plot) => {
            this.clearDataPlot(plot);
            return plot.id;
          })
        }
        await this.getChartsAndEmit({plotIds});
      } catch(e) {
        console.warn(e);
      }

    }, 1500);

    // loop over plots
    this.config.plots.forEach((plot, index) => {

      // BACKCOMP (depend on which plotly version installed on server) 
      const title = 'Object' === toRawType(plot.plot.layout.title) ? plot.plot.layout.title.text : plot.plot.layout.title;

      // add plot id
      this.state.positions.push(plot.id);

      // set relation to null
      plot.withrelations = null;

      /**
       * Data attribute store data
       * 
       * @since 3.5.1 
       */
      plot.data = null;

      // set already loaded false
      plot.loaded = false;

      plot.plot.layout._title = title ;

      plot.label = title || `Plot id [${plot.id}]`;

      // set auto margin
      plot.plot.layout.xaxis.automargin = true;

      plot.plot.layout.yaxis.automargin = true;

      plot.filters = [];

      // get layer id
      const layerId = plot.qgs_layer_id;

      // add to Array layerId
      layersId.add(layerId);

      // listen layer change filter to reload the charts
      const layer = CatalogLayersStoresRegistry.getLayerById(layerId);

      // check if layer has geometry
      const geolayer = layer.isGeoLayer();

      plot.crs = geolayer ? layer.getCrs() : undefined;

      plot.tools = {
        filter:    layer.getFilter(),    // reactive layer filter attribute:     { filter:    { active: <Boolean> } }
        selection: layer.getSelection(), // reactive layer selection attribute : { selection: { active: <Boolean> } }
        geolayer: Vue.observable({
          show: geolayer, // if is geolayer show map tool
          active: false, // start to false
        })
      };

      // check if a layer has child (relation) → so add withrerlations attribute to plot
      if (layer.isFather()) {
        const relations = [];
        layer.getRelations().getArray().forEach(relation => {
          if (relation.getFather() === layerId) {
            relations.push({
              id: relation.getId(),               // relation id
              relationLayer: relation.getChild(), // relation layer child
            });
          }
          this._relationIdName[relation.getId()] = relation.getName();
        });
        plot.withrelations = {
          relations,
          data: null,
        }; // add Array relations
      }

      // listen layer change filtertokenchange
      layer.on('filtertokenchange', this.changeChartsEventHandler)

    });

    BASEQPLOTLYAPIURL = `${BASEQPLOTLYAPIURL}/${this.getGid()}`;

    this.queryResultService.addLayersPlotIds([...layersId]);

    this.queryResultService.on('show-chart', this.showChartsOnContainer);
    this.queryResultService.on('hide-chart', this.clearChartContainers);

    // get close component event key when component (right element where result are show is closed)
    this.closeComponentKeyEevent = this.queryResultService.onafter('closeComponent', this.clearChartContainers);

    this.setContentChartTools();

    // Emit plugin service is ready
    this.emit('ready');
  };

  /**
   * Called from queryResultService on 'show-chart' event
   * 
   * @param ids
   * @param container
   * @param relationData
   */
  this.showChartsOnContainer = (ids, container, relationData) => {
    const findContainer = this.chartContainers.find(queryresultcontainer => container.selector === queryresultcontainer.container.selector);
    if (undefined === findContainer) {
      this.chartContainers.push({ container, component: null });
    }

    // clear already plot loaded by query service
    this.config.plots.forEach((plot) => {
      if (plot.loaded) {
        this.clearDataPlot(plot);
      }
    })

    this.showChart(undefined === findContainer, ids, container, relationData);
  };

  /**
   * Clear chart containers
   * 
   * @param container
   */
  this.clearChartContainers = (container) => {
    this.chartContainers = this.chartContainers.filter(queryResultsContainer => {
      if (!container || (container.selector === queryResultsContainer.container.selector)) {
        $(queryResultsContainer.component.$el).remove();
        queryResultsContainer.component.$destroy();
        return false;
      }
      return true;
    });

    // clear already plot loaded by query service
    this.config.plots.forEach((plot) => {
      if (plot.loaded) {
        this.clearDataPlot(plot);
      }
    });
  };

  /**
   * @since 3.5.2
   * 
   * @returns { number }
   */
  this.getNumberOfShowPlots = function() {
    return this.getShowPlots(true).length;
  }

  /**
   * Toggle filter token on project layer
   * 
   * @param layerId
   */
  this.toggleLayerFilter = async function(layerId) {
    const layer = CatalogLayersStoresRegistry.getLayerById(layerId);
    if (undefined !== layer) {
      await layer.toggleFilterToken();
    }
  };

  /**
   * Set array of active filter on a plot (eg. map bbox or filtertoken)
   * 
   * @param plot
   */
  this.setActiveFilters = function(plot) {
    // let change     = false;
    // const _filters = [...plot.filters];

    plot.filters   = [];

    // filtertoken is active
    if (true === plot.tools.filter.active) {
      plot.filters.push('filtertoken');
    }

    // map bbox tools is active
    if (true === plot.tools.geolayer.active) {
      plot.filters.length > 0 ?
        plot.filters.splice(0, 1, 'in_bbox_filtertoken') :
        plot.filters.push('in_bbox');
    }
  };

  /**
   * Get new data charts and emit `change-charts` listened by qplotly.vue component to redraw charts
   * 
   * @param { Object } options
   * @param options.plotIds
   * 
   * @returns { Promise<void> }
   * 
   * @fires change-charts
   */
  this.getChartsAndEmit = async function({ plotIds } = {}) {
    const { charts, order } = await this.getCharts({ plotIds }); // get charts
    this.emit('change-charts', { charts, order })                // charts are change
  };

  /**
   * Show plot chart
   * 
   * @param plot
   * 
   * @returns { Promise<void> }
   */
  this.showPlot = async function(plot) {

    // whether geolayer tools is show
    const has_geo = plot.tools.geolayer.show;

    // get active boolean from map toggled
    plot.tools.geolayer.active = has_geo ? this.state.tools.map.toggled : plot.tools.geolayer.active;

    // add current plot id in case of already register move map event
    if (has_geo && this.keyMapMoveendEvent.key) {
      this.keyMapMoveendEvent.plotIds.push({ id: plot.id, active: this.state.tools.map.toggled });
    }

    // set main map geolayer tools based on if there are plot belong to a geolayer
    this.setContentChartTools();

    /**
     * @TODO make it simpler..
     */
    // whether there are chart to reload (in case of parent plot relations)
    // check if other plot with the same `qgs_layer_id` has already loaded child plot
    if (
      null !== plot.withrelations &&
      undefined === this.getShowPlots(true).find((p) => p.id !== plot.id && p.qgs_layer_id === plot.qgs_layer_id)
    ) {
      // not find a show plot with same qgs_layer_id
      this
        .getShowPlots()
        .forEach((p) => {
          // find a child plot show
          if (p.id !== plot.id && undefined !== plot.withrelations.relations.find(({ relationLayer }) => p.qgs_layer_id === relationLayer)) {
            // if found clear plot data to force to reload by parent plot
            const plotIds = this.clearDataPlot(p);
            if (plotIds.length > 0) {
              this.getChartsAndEmit({ plotIds });
            }
          }
        });
    }

    await this.getChartsAndEmit({ plotIds: [plot.id] });

  };

  /**
   * Hide plot chart
   * 
   * @param plot
   * 
   * @returns { Promise<void> }
   * 
   * @fires show-hide-chart
   */
  this.hidePlot = async function(plot) {

    // whether geolayer tools is show
    const has_geo = plot.tools.geolayer.show;

    // deactive geolayer tools
    plot.tools.geolayer.active = has_geo ? false : plot.tools.geolayer.active;

    // remove map Move end from plotids keys when there is a key moveend listener 
    if (has_geo && this.keyMapMoveendEvent.key) {
      this.keyMapMoveendEvent.plotIds = this.keyMapMoveendEvent.plotIds.filter(plotId => plot.id !== plotId.id);
    }

    // no plots have active geo tools
    if (has_geo && 0 === this.keyMapMoveendEvent.plotIds.length) {
      this.customParams.bbox       = undefined; // set request params to undefined
      this.state.tools.map.toggled = false;     // un-toggle main chart map tool
    }

    // clear data of plot
    const plotIds = this.clearDataPlot(plot);
    if (plotIds.length > 0) {
      this.getChartsAndEmit({ plotIds });
    }

    this.setContentChartTools();

    // remove filters eventually
    this.setActiveFilters(plot);

    // update Qplotly chart component
    this.emit('show-hide-chart', { plotId: plot.id, action: 'hide', filter: plot.filters, ...this.createChartsObject() });

  };

  /**
   * @param { Object }            options
   * @param { Array | undefined } options.order order of plot ids
   * 
   * @returns {{ charts: {}, order: (*|*[]) }}
   */
  this.createChartsObject = function({ order } = {}) {
    return {
      order:  order || this.getShowPlots(true).map(plot => plot.id),
      charts: {},
    }
  };

  /**
   * Get charts plots from plugin configuration
   * 
   * @returns {[]|*}
   */
  this.getPlots = function() {
    return this.config.plots;
  };

  /**
   * @FIXME add description
   */
  this.clearLoadedPlots = function() {
    this.state.tools.map.toggled = false;
    this.customParams.bbox       = undefined;
    this.handleKeyMapMoveendEvent({ listen: false });
    this.getShowPlots(true).forEach(plot => {
      this.clearDataPlot(plot);
      if (true === plot.tools.geolayer.show) {
        plot.tools.geolayer.active = false;
      }
      plot.filters = [];
    });
    this.showCharts = false;
  };

  /**
   * @FIXME add description
   * 
   * @param { boolean } force
   */
  this.setBBoxParameter = function(force = false) {
    this.customParams.bbox = (force || true === this.state.tools.map.toggled) ? this.mapService.getMapBBOX().toString() : undefined;
  };

  /**
   * @FIXME add description
   * 
   * @param { Object } plotIds
   * @param plotIds.id
   * @param plotIds.active
   * 
   * @returns { Promise<unknown> }
   */
  this.updateMapBBOXData = async function({ id, active }) {
    const plotIds = [{ id, active }];
    const plot    = this.getPlotById(id);
    this
      .getShowPlots(true)
      .forEach((p) => {
        if (p.id !== id && p.qgs_layer_id === plot.qgs_layer_id) {
          p.tools.geolayer.active = active;
          this.clearDataPlot(p);
          plotIds.push({ id: p.id, active })
        }
      });


    // set bbox parameter to force
    this.setBBoxParameter(true);

    this.mainbboxtool = false;

    this.handleKeyMapMoveendEvent({ plotIds, listen: true });

    this.clearDataPlot(plot);

    return await this.getCharts({ plotIds: plotIds.map(({ id }) => id) });
  };

  /**
   * Handle moveend map event
   * 
   * @param { Object }  opts
   * @param { boolean } opts.listen
   * @param { Array }   opts.plotIds
   */
  this.handleKeyMapMoveendEvent = function({
    listen = false,
    plotIds = []
  } = {}) {
    // which plotIds need to trigger map moveend event
    if (listen) {
      this.keyMapMoveendEvent.plotIds = plotIds;
    }

    // get map moveend event just one time
    if (listen && null === this.keyMapMoveendEvent.key) {
      this.keyMapMoveendEvent.key = this.mapService.getMap().on('moveend', this.changeChartsEventHandler);
    }

    // remove handler of map moveend and reset to empty
    if (!listen) {
      ol.Observable.unByKey(this.keyMapMoveendEvent.key);
      this.keyMapMoveendEvent.key     = null;
      this.keyMapMoveendEvent.plotIds = [];
    }
  };

  /**
   * Reload chart data for every charts
   */
  this.updateCharts = async function(change = false) {
    let charts;

    this.setLoadingCharts(true);

    this.mainbboxtool            = true;

    this.state.tools.map.toggled = change ? !this.state.tools.map.toggled: this.state.tools.map.toggled;

    // set bbox parameter
    this.setBBoxParameter();

    // get active plot related to geolayer
    const activeGeolayerPlots = this
      .getShowPlots(true)
      .filter(plot => {
        if (true === plot.tools.geolayer.show) {
          plot.tools.geolayer.active = !!this.state.tools.map.toggled;
          return true;
        }
        return false;
      });

    this.handleKeyMapMoveendEvent({
      listen: this.state.tools.map.toggled,
      plotIds: activeGeolayerPlots.map(plot => ({ id: plot.id, active: plot.tools.geolayer.active }))
    });

    try {
      charts = await this.getCharts({
        plotIds: activeGeolayerPlots.map((plot) => { this.clearDataPlot(plot); return plot.id; }),
      });
    } catch(e) {
      console.warn(e);
    }

    return charts;
  };


  /**
   * @param plot object
   */
  this.clearDataPlot = function(plot) {
    const plotIds = [];    // plotId eventually to reload
    plot.loaded   = false; // set loaded data to false
    plot.data     = null;  // set dat to null

    // in case of plot father and has relation data and data related to
    if (null !== plot.withrelations && null !== plot.withrelations.data) {
      Object
        .values(plot.withrelations.data)
        .forEach((dataRelationPlot) => {
          dataRelationPlot.forEach(({ id }) => {
            this.clearDataPlot(this.getPlotById(id));
            plotIds.push(id);
          })
        });
      plot.withrelations.data = null;
    }

    // check if we need to remove relation data coming from parent plot
    if (null === plot.withrelations) {
      this
        .getShowPlots(true)
        .forEach((p) => {
          // skip when ..
          if (false === (p.id !== plot.id && null !== p.withrelations && null !== p.withrelations.data)) {
            return;
          }
          // plot has different id from current hide plot and it has dara relations
          Object
            .entries(p.withrelations.data)
            .forEach(([relationId, dataRelationPlot]) => {
              dataRelationPlot.forEach(({id}, index) => {
                if (id === plot.id) {
                  dataRelationPlot.splice(index, 1);
                }
              })
              if (0 === dataRelationPlot.length) {
                delete p.withrelations.data[relationId];
              }
              if (0 === dataRelationPlot.length && 0 === Object.keys(p.withrelations.data).length) {
                p.withrelations.data = null;
              }
            });
        });
    }

    return plotIds;
  }

  /**
   * Set geo-layer tools true or false if some plot chart has geolayer show
   * 
   * if no show plot have geolayer tool to show (geolayer) hide charts geolayer tool
   */
  this.setContentChartTools = function() {
    this.state.geolayer = undefined !== this.getShowPlots(true).find(plot => plot.tools.geolayer.show);
  };

  /**
   * Show loading charts data (loading === true) is on going
   * 
   * @param   { boolean } loading
   * @returns { undefined }
   */
  this.setLoadingCharts = function(loading) {
    this.state.loading = loading;

    if (undefined === this.relationData) {
      GUI.disableSideBar(loading);
      GUI.setLoadingContent(loading);
    }

  };

  /**
   * @param   { boolean } show 
   * @returns { Array } filtered plots based on show parameter
   */
  this.getShowPlots = function(show = true) {
    return this.config.plots.filter(plot => show === plot.show);
  };

  /**
   * @since 3.5.2
   */
  this.getPlotById = function(id) {
    return this.config.plots.find((plot) => plot.id === id);
  };

  /**
   * Get charts data from server
   * 
   * @param { Object } opts
   * @param opts.layerIds          provide by query by result service otherwise is undefined
   * @param opts.relationData      provide by query by result service otherwise is undefined
   * @param { Array } opts.plotIds plots id to show
   * 
   * @returns { Promise<unknown> }
   */
  this.getCharts = async function({
    layerIds,
    plotIds,
    relationData,
  } = {}) {

    alert('FIXME: getCharts returns an empty object!');

    // check if it has relation data
    this.relationData = relationData;

    return new Promise((resolve) => {
      let plots; // array of plots that need to be get data to show charts

      const GIVE_ME_A_NAME_1 = undefined !== layerIds;
      const GIVE_ME_A_NAME_2 = !GIVE_ME_A_NAME_1 && undefined !== plotIds;
      const GIVE_ME_A_NAME_3 = !GIVE_ME_A_NAME_1 && !GIVE_ME_A_NAME_2;

      // get plots request from Query Result Service
      if (GIVE_ME_A_NAME_1) {
        plots = this.config.plots.filter(plot => -1 !== layerIds.indexOf(plot.qgs_layer_id));
      }

      // filter only plots that have id belong to plotIds array set by check uncheck plot on sidebar interface
      if (GIVE_ME_A_NAME_2) {
        plots = [];
        plotIds.forEach((plotId) => {
          // check if is child of already show plots
          let addPlot = this.getShowPlots(true).find(plot => {
            return (
              (
                plot.id !== plotId &&
                null !== plot.withrelations &&
                // find a plot that has withrelations array and with relationLayer the same layer id belong to plot qgis_layer_id
                (undefined !== plot.withrelations.relations.find(({id:relationId, relationLayer}) => (
                  relationLayer === this.getPlotById(plotId).qgs_layer_id &&
                  (
                    null === plot.withrelations.data ||
                    undefined === plot.withrelations.data[relationId] ||
                    undefined === plot.withrelations.data[relationId].find(({ id }) => id === plotId)
                  )
                )))
              )
            )
          })
          // if not find add plot by plotId
          if (undefined === addPlot) {
            addPlot = this.getPlotById(plotId)
          }
          // check if already (in case of parent plots) added to plots
          if (undefined === plots.find((plot) => plot === addPlot)) {
            plots.push(addPlot);
          }
        });
      }

      // get only plots that have attribute show to true and not in relation with other plot show
      if (GIVE_ME_A_NAME_3) {
        plots = this.getShowPlots(true).filter(plot => {
          return (
            // and if not belong to show plot father relation
            (undefined === this.getShowPlots(true).find((p) =>
            (
              plot.id !== p.id &&                    // is not the same plot id
              null !== p.withrelations &&            // plot has relations
              // find a plot that has withrelations array and with relationLayer the same layer id belog to plot qgis_layer_id
              undefined !== p.withrelations.relations.find(({id, relationLayer}) => ((relationLayer === plot.qgs_layer_id)))
            )))
          )
        })
      }

      // create charts Object
      const chartsObject = this.createChartsObject({ order: layerIds && plots.map(plot => plot.id) });

      /** @TODO is this still relevant? */
      // skip if is unsupported
      if (!Promise.allSettled) {
        return;
      }

      // set main map visible filter tool

      const promises                = []; // promises array
      const chartsplots             = []; // TODO: set that register already relation loaded to avoid to replace the same plot multi time
      const relationIdAlreadyLoaded = new Set();

      // loop through array plots
      plots.forEach(plot => {

        let promise;
        let plotRelationData; // contain data coming from father plots

        const GIVE_ME_A_NAME_4 =             // if already loaded (show)
          true === plot.loaded &&
          (
            null === plot.withrelations ||
            (
              null !== plot.withrelations.data &&
              0 === this
                .getShowPlots(true)
                .filter((p) => (undefined !== plot.withrelations.relations.find(({ relationLayer }) => (p.qgs_layer_id === relationLayer))))
                .reduce((notChildPlotData, p) => { notChildPlotData += (undefined !== Object.values(plot.withrelations.data).find((relationData) => (undefined !== relationData.find(({ id, data }) => id === p.id)))) ? 0 : 1; return notChildPlotData }, 0)
            )
          );

        const GIVE_ME_A_NAME_5 = !GIVE_ME_A_NAME_4 &&
          undefined === relationData &&               // no relation data passed by query result service
          this.getShowPlots(true).length > 1 &&       // check if plots are more than one
          undefined !== this                          // find if is a plots that belong to plot father
            .getShowPlots(true)
            .find((p) => {
              if (
                p.id !== plot.id &&
                null !== p.withrelations &&
                null !== p.withrelations.data &&
                undefined !== Object.values(p.withrelations.data).find((relationData) => undefined !== relationData.find(({ id, data }) => { if (id === plot.id) { plotRelationData = data; return true; } })
                )
              ) {
                promises.push(Promise.resolve({ result: true, data: [ plotRelationData ] }));
                return true;
              }
            });

        const GIVE_ME_A_NAME_6 = !GIVE_ME_A_NAME_4 && !GIVE_ME_A_NAME_5;

        // in case of no request (relation) and not called from query
        if (GIVE_ME_A_NAME_4) {
          promises.push(Promise.resolve({
            result: true,
            data: plot.data,
            relations: plot.withrelations && plot.withrelations.data,
          }));
        }

        if (GIVE_ME_A_NAME_5) {

        }

        if (GIVE_ME_A_NAME_6) {
          const chartsRelations    = undefined !== this.relationData && this.relationData.relations.filter(relation => plot.qgs_layer_id === relation.referencingLayer).map(relation => `${relation.id}|${this.relationData.fid}`);
          // case called by Query result service
          const relationsonetomany = undefined !== this.relationData ? (chartsRelations.length ? chartsRelations : [undefined]) : []; // set initial to undefined

          relationsonetomany.forEach(relationonetomany => {
            chartsplots.push(plot);
            promise = true === plot.loaded
              ? Promise.resolve({ data: plot.data })
              : XHR.get({                                                        // request server data
                url: `${BASEQPLOTLYAPIURL}/${plot.qgs_layer_id}/${plot.id}/`,
                params: {
                  relationonetomany,
                  // filtertoken paramater
                  filtertoken: ApplicationState.tokens.filtertoken || undefined,
                  // withrelations parameter (check if plot has relation child → default: undefined)
                  withrelations: plot.withrelations && plot.withrelations.relations.filter(({ id: relationId, relationLayer }) => {
                      if (
                          undefined !== this.getShowPlots(true).find((p) => p.qgs_layer_id === relationLayer && false === p.loaded) &&
                          false === relationIdAlreadyLoaded.has(relationId)
                      ) {
                        relationIdAlreadyLoaded.add(relationId);
                        plot.loaded = false;
                        return true;
                      }
                    })
                    .map(({ id }) => id)
                    .join(',')
                    || undefined,
                  // in_bbox parameter (in case of tool map toggled)
                  in_bbox: (this.keyMapMoveendEvent.plotIds.length > 0 ? -1 !== this.keyMapMoveendEvent.plotIds.filter(p => p.active).map(p => p.id).indexOf(plot.id) : true) && this.customParams.bbox ? this.customParams.bbox : undefined,
                },
              });
            promises.push(promise);
          });
        }

      });

      // wait all promises
      Promise
        .allSettled(promises)
        .then(async promisesData => {
          promisesData.forEach((promise, index) => {
            const GIVE_ME_A_NAME_7 = false == ('fulfilled' === promise.status && promise.value.result);

            // some error occurs during get data from server
            if (GIVE_ME_A_NAME_7) {
              const plot = chartsObject[index];
              this.setActiveFilters(plot);
              const chart = {
                filters: plot.filters,
                layout:  plot.plot.layout,
                tools:   plot.tools,
                layerId: plot.qgs_layer_id,
                title:   plot.plot.layout.title,
                data:    null,
              };
              if (chartsObject.charts[plot.id]) {
                chartsObject.charts.push(chart);
              } else {
                chartsObject.charts = [chart];
              }
            }
            // skip on relation or invalid response
            if (GIVE_ME_A_NAME_7 || promise.value.relation) {
              return;
            } 

            // request has valid response
            const { data, relations } = promise.value;
            const plot                = chartsplots[index];

            plot.data                 = data;
            plot.loaded               = true;
            plot.plot.layout.title    = plot.plot.layout._title;

            this.setActiveFilters(plot);

            const chart = {
              filters: plot.filters,
              layout:  plot.plot.layout,
              tools:   plot.tools,
              layerId: plot.qgs_layer_id,
              title:   plot.plot.layout.title,
              data:    data[0],
            };

            // multiple chart plot of same plot
            if (chartsObject.charts[plot.id]) {
              chartsObject.charts[plot.id].push(chart);
            } else {
              chartsObject.charts[plot.id] = [chart];
            }

            // add data to relations
            if (relations && null === plot.withrelations.data) {
              plot.withrelations.data = relations;
            } else if (relations) {
              Object.keys(relations).forEach((relationId) => { plot.withrelations.data[relationId] = relations[relationId]; });
            }

            // data has a relations attributes data
            // loop through relations by id
            Object.keys(relations || []).forEach(relationId => {
              // get relation data
              relations[relationId].forEach(({ id, data }) => {
                // get father filter plots
                const fatherPlotFilters = plot.filters;
                // filter only show plot
                this.config.plots
                  .filter(plot => plot.show && plot.id === id)
                  .forEach((plot, index) => {
                    this.setActiveFilters(plot);
                    plot.loaded = true;
                    plot.data   = data;
                    const chart = {
                      data:    data[0],
                      filters: plot.filters,
                      layout:  layout,
                      tools:   plot.tools,
                      layerId: plot.qgs_layer_id,
                      title:   plot.plot.layout.title,
                    };
                    if (chartsObject.charts[plot.id]) {
                      chartsObject.charts[plot.id].push(chart);
                    } else {
                      chartsObject.charts[plot.id] = [chart];
                    }
                    plot.plot.layout.title = `${this._relationIdName[relationId]} ${plot.plot.layout._title}`;
                    if (fatherPlotFilters.length) {
                      plot.filters.push(`relation.${fatherPlotFilters[0]}`);
                    }
                });
              })
            });

          });

          this.showCharts = true;

          this.removeInactivePlotIds();

          resolve(chartsObject);
        })
        .catch(console.warn);

    });

  };

  /**
   * @FIXME add description
   */
  this.removeInactivePlotIds = function() {
    const { toggled } = this.state.tools.map;

    /** @FIXME add description */
    if (false === toggled) {
      this.keyMapMoveendEvent.plotIds = this.keyMapMoveendEvent.plotIds.filter(plotId => plotId.active);
    }

    /** @FIXME add description */
    if (false === toggled && 0 === this.keyMapMoveendEvent.plotIds.length && this.keyMapMoveendEvent.key) {
      this.handleKeyMapMoveendEvent({ listen: false });
    }
  };

  /**
   * @returns {*}
   */
  this.getChartLayout = function() {
    return this.config.plots[0].layout;
  };

  /**
   * @returns {*}
   */
  this.getChartConfig = function() {
    return this.config.plots[0].config;
  };

  /**
   * @param self service instance
   * @param {*} content 
   * 
   * @fires Service~change-charts
   */
  function _showChartInSidebar(self, content) {
    GUI.showContent({
      closable: false,
      title: 'plugins.qplotly.title',
      style: {
        title: {
          fontSize: '1.3em',
        }
      },
      // set header action tools (eg. map filter)
      headertools: [
        Vue.extend({
          ...HeaderContentAction,
          data() {
            return {
              state: self.state,
              tools: {
                map: {
                  show: self.state.geolayer && !self.relationData,
                  disabled: true,
                }
              }
            };
          },
          methods: {
            async updateCharts() {
              const { charts, order } = await self.updateCharts(true);
              await this.$nextTick();
              self.emit('change-charts', { charts, order });
            },
          },
        }),
      ],
      content,
    });
  }

  /**
   * Called when queryResultService emit event show-chart (or open/close sidebar item)
   * 
   * @param { boolean } bool true = show chart
   * @param { Array } ids    passed by query result services
   * @param container        DOM element - passed by query result service
   * @param relationData     Passed by query result service
   * 
   * @returns { Promise<unknown> }
   */
  this.showChart = function(bool, ids, container, relationData) {
    return new Promise(resolve => {

      /** @FIXME add description */
      if (true !== bool && undefined === container) {
        GUI.closeContent();
      }

      /** @FIXME add description */
      if (true !== bool && undefined !== container) {
        this.clearChartContainers(container);
      }

      /** @FIXME add description */
      if (true !== bool) {
        resolve();
        return;
      }

      // need to be async
      setTimeout(() => {
        const content   = new QPlotlyComponent({ ids, relationData, service: this });
        const component = content.getInternalComponent(); // internal g3w Component

        // when not called from Query Result Service
        if (undefined !== container) {
          component.$once('hook:mounted', async function() { container.append(this.$el); });
          component.$mount();
          this.chartContainers.find(queryResultsContainer => container.selector === queryResultsContainer.container.selector).component = component;
        }

        // when called by sidebar item (once chartsReady event resolve promise)
        if (undefined === container) {
          _showChartInSidebar(this, content);
        }

      });

    });
  };

  /**
   * Clear method
   */
  this.clear = function() {
    GUI.removeComponent('qplotly', 'sidebar', { position: 1 });
    GUI.closeContent();

    // unlisten layer change filter to reload charts
    layersId.forEach(layerId => {
      const layer = CatalogLayersStoresRegistry.getLayerById(layerId);
      if (undefined !== layer) {
        layer.off('filtertokenchange', this.changeChartWhenFilterChange)
      }
    });

    this.mapService = null;
    this.chartContainers = [];
    this.queryResultService.removeListener('show-charts', this.showChartsOnContainer);
    this.queryResultService.un('closeComponent', this.closeComponentKeyEevent);
    this.closeComponentKeyEevent = null;
    layersId.clear();
    this.mainbboxtool = null;
    this.queryResultService = null;
    this.emit('clear');
  };

}

inherit(Service, PluginService);

export default new Service();

 