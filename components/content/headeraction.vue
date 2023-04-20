<template>
    <div
      v-if="showTools"
      class="qplotly-tools"
      style="border-radius: 3px; background-color: #FFFFFF; font-size: 1.2em; margin-right: 5px;">

      <span
        v-if ="tools.map.show"
        class="skin-color action-button skin-tooltip-bottom"
        v-disabled="state.loading"
        data-placement="bottom"
        data-toggle="tooltip"
        style="font-weight: bold; margin: 3px"
        :class="[g3wtemplate.getFontClass('map'), state.tools.map.toggled ? 'toggled' : '']"
        @click.stop="updateCharts"
        v-t-tooltip.create="'plugins.qplotly.tooltip.show_all_features_on_map'" >
      </span>

    </div>
</template>

<script>
  export default {
    name: 'Headeraction',
    computed: {
      showTools(){
        return this.tools.map.show;
      },
    },
    watch: {
      async 'state.geolayer'(bool){
        await this.$nextTick();
        this.tools.map.show = bool;
      }
    }
  };
</script>
