<template>
  <div
    style = "width:100%;"
    class = "g3w-chart-header"
  >

    <div
      class = "skin-background-color"
      style = "
        display:flex;
        width: 100%;
        font-weight: bold;
        padding: 2px;
        min-height: 20px;
        font-size: 1.4em;
        text-align: center;
        color: #FFF;
      "
    >

      <div style="margin:auto">{{ title }}</div>

      <div
        v-if  = "showtools"
        class = "plot-tools"
        style = "
          background-color: #FFF;
          padding: 2px;
          font-size: 1.0em;
          border-radius: 3px;
        "
      >

        <span
          v-if               = "tools.selection.active"
          style              = "margin: auto"
          class              = "action-button skin-tooltip-bottom"
          @click.stop        = "toggleFilter"
          :class             = "{ 'toggled': tools.filter.active }"
          data-placement     = "bottom"
          data-toggle        = "tooltip"
          v-t-tooltip.create = "'plugins.qplotly.tooltip.filter_chart'"
        >
          <span
            class  = "action-button-icon"
            :class = "g3wtemplate.getFontClass('filter')"
          ></span>
        </span>

        <span
          v-if               = "tools.geolayer.show"
          style              = "margin: auto"
          class              = "action-button skin-tooltip-bottom"
          :class             = "{ 'toggled': tools.geolayer.active }"
          @click.stop        = "toggleBBoxTool"
          data-placement     = "bottom"
          data-toggle        = "tooltip"
          v-t-tooltip.create = "'plugins.qplotly.tooltip.show_feature_on_map'"
        >
          <span
            class  = "action-button-icon"
            :class = "g3wtemplate.getFontClass('map')"
          ></span>
        </span>

      </div>

    </div>

    <ul
      v-if  = "filters.length > 0"
      class = "skin-color"
      style = "
        margin-top: 5px;
        list-style-type: none;
        background-color: #FFF;
        padding-left: 3px;
        font-weight: bold;
      "
    >
      <li
        v-for      = "filter in filters"
        :key       = "filter"
        v-t-plugin = "`qplotly.filters.${filter}`"
      ></li>
    </ul>

  </div>
</template>

<script>
  export default {

    name: "plotheader",

    props:{

      index: {
        type: Number,
      },

      layerId:{
        type: String,
      },

      title: {
        type: String,
        default: "",
      },

      tools: {
        type: Object,
        default() {
          return {
            filter: {
              active: false,
            },
            selection: {
              active: false,
            },
            geolayer: {
              show: false,
              active: false,
            },
          };
        },
      },

      filters: {
        type: Array,
        default: [],
      },

    },

    computed: {

      showtools() {
        return this.tools.geolayer.show || this.tools.selection.active;
      },

    },

    methods: {

      /**
       * @fires toggle-filter-tool
       */
      toggleFilter() {
        this.$emit('toggle-filter-tool', { layerId: this.layerId });
      },

      /**
       * @fires toggle-bbox-tool
       */
      toggleBBoxTool() {
        this.tools.geolayer.active = !this.tools.geolayer.active;
        this.$emit('toggle-bbox-tool', { index: this.index, active: this.tools.geolayer.active });
      },

    },

  };
</script>