import React, { Component } from "react";
import { Utils } from "@react-awesome-query-builder/core";
import PropTypes from "prop-types";
import range from "lodash/range";
import {getOpCardinality} from "../../utils/stuff";
import {useOnPropsChanged} from "../../utils/reactUtils";
import pick from "lodash/pick";
import WidgetFactory from "./WidgetFactory";
import classNames from "classnames";
import {Col} from "../utils";
const {getFieldConfig, getOperatorConfig, getFieldWidgetConfig} = Utils.ConfigUtils;
const {getValueSourcesForFieldOp, getWidgetForFieldOp, getValueLabel} = Utils.RuleUtils;
const { createListFromArray } = Utils.DefaultUtils;
const {shallowEqual} = Utils.OtherUtils;

const funcArgDummyOpDef = {cardinality: 1};

export default class Widget extends Component {
  static propTypes = {
    config: PropTypes.object.isRequired,
    value: PropTypes.any, //instanceOf(Immutable.List)
    valueSrc: PropTypes.any, //instanceOf(Immutable.List)
    valueError: PropTypes.any, //instanceOf(Immutable.List)
    fieldError: PropTypes.string,
    field: PropTypes.any,
    fieldSrc: PropTypes.string,
    fieldType: PropTypes.string,
    operator: PropTypes.string,
    readonly: PropTypes.bool,
    asyncListValues: PropTypes.array,
    id: PropTypes.string,
    groupId: PropTypes.string,
    //actions
    setValue: PropTypes.func,
    setValueSrc: PropTypes.func,
    setFuncValue: PropTypes.func,
    // for isFuncArg
    isFuncArg: PropTypes.bool,
    fieldFunc: PropTypes.string,
    fieldArg: PropTypes.string,
    leftField: PropTypes.any,
    // for RuleGroupExt
    isForRuleGroup: PropTypes.bool,
    parentField: PropTypes.string,
    // for func in func
    parentFuncs: PropTypes.array,
    isLHS: PropTypes.bool,
    // for case_value
    isCaseValue: PropTypes.bool,
  };

  constructor(props) {
    super(props);
    useOnPropsChanged(this);

    this.onPropsChanged(props);
  }

  onPropsChanged(nextProps) {
    const prevProps = this.props;
    const keysForMeta = [
      "config", "id", "parentFuncs",
      "field", "fieldSrc", "fieldType", "fieldFunc", "fieldArg", "leftField", "operator", "valueSrc", "asyncListValues",
      "isLHS", "isFuncArg", "isForRuleGroup", "isCaseValue",
    ];
    const needUpdateMeta = !this.meta 
          || keysForMeta
            .map(k => (
              k === "parentFuncs"
                ? !shallowEqual(nextProps[k], prevProps[k], true)
                //tip: for isFuncArg we need to wrap value in Imm list
                : k === "isFuncArg"
                  ? nextProps[k] !== prevProps[k] || nextProps["isFuncArg"] && nextProps["value"] !== prevProps["value"]
                  : nextProps[k] !== prevProps[k]
            ))
            .filter(ch => ch).length > 0;

    if (needUpdateMeta) {
      this.meta = this.getMeta(nextProps);
    }
  }

  _setValue = (
    isSpecialRange, delta, widgetType, widgetId, // bound!
    value, asyncListValues, _meta = {}
  ) => {
    if (!_meta.widgetId) {
      _meta.widgetId = widgetId;
    }
    if (isSpecialRange && Array.isArray(value)) {
      const oldRange = [this.props.value.get(0), this.props.value.get(1)];
      if (oldRange[0] != value[0])
        this.props.setValue(0, value[0], widgetType, asyncListValues, _meta);
      if (oldRange[1] != value[1])
        this.props.setValue(1, value[1], widgetType, asyncListValues, _meta);
    } else {
      this.props.setValue(delta, value, widgetType, asyncListValues, _meta);
    }
  };

  _setValueSrc = (
    delta, widgetId, // bound!
    srcKey
  ) => {
    const _meta = {
      widgetId,
    };
    this.props.setValueSrc(delta, srcKey, _meta);
  };

  getMeta({
    config, field: simpleField, fieldSrc, fieldType, fieldFunc, fieldArg, operator, valueSrc: valueSrcs, value: values,
    isForRuleGroup, isCaseValue, isFuncArg, leftField, asyncListValues, parentFuncs, isLHS, id,
  }) {
    const field = isFuncArg ? {func: fieldFunc, arg: fieldArg} : simpleField;
    const isOkWithoutField = !simpleField && fieldType;
    let iValueSrcs = valueSrcs;
    let iValues = values;
    if (isFuncArg || isForRuleGroup || isCaseValue) {
      iValueSrcs = createListFromArray([valueSrcs]);
      iValues = createListFromArray([values]);
    }

    let fieldDefinition = getFieldConfig(config, field);
    if (!fieldDefinition && isOkWithoutField) {
      fieldDefinition = config.types[fieldType];
    }
    let defaultWidget = getWidgetForFieldOp(config, field, operator);
    if (!defaultWidget && isOkWithoutField) {
      defaultWidget = config.types[fieldType]?.mainWidget;
    }
    const operatorDefinition = isFuncArg
      ? funcArgDummyOpDef
      : getOperatorConfig(config, operator, field);
    if ((fieldDefinition == null || operatorDefinition == null) && !isCaseValue) {
      return null;
    }
    const isSpecialRange = operatorDefinition?.isSpecialRange;
    const isSpecialRangeForSrcField = isSpecialRange && (iValueSrcs?.get(0) == "field" || iValueSrcs?.get(1) == "field");
    const isTrueSpecialRange = isSpecialRange && !isSpecialRangeForSrcField;
    const cardinality = isTrueSpecialRange ? 1 : getOpCardinality(operatorDefinition);
    if (cardinality === 0) {
      return null;
    }

    let valueSources = getValueSourcesForFieldOp(config, field, operator, fieldDefinition);
    if (!field) {
      valueSources = Object.keys(config.settings.valueSourcesInfo);
    }
    const widgets = range(0, cardinality).map(delta => {
      const valueSrc = iValueSrcs?.get(delta) || null;
      let widget = getWidgetForFieldOp(config, field, operator, valueSrc);
      let widgetDefinition = getFieldWidgetConfig(config, field, operator, widget, valueSrc);
      if (isSpecialRangeForSrcField) {
        widget = widgetDefinition.singleWidget;
        widgetDefinition = getFieldWidgetConfig(config, field, operator, widget, valueSrc);
      }
      if (!widgetDefinition && isOkWithoutField) {
        widget = ["func", "field"].includes(valueSrc) ? valueSrc : defaultWidget;
        widgetDefinition = config.widgets[widget];
      }
      const widgetType = widgetDefinition?.type;
      const valueLabel = getValueLabel(config, field, operator, delta, valueSrc, isTrueSpecialRange);
      const widgetValueLabel = getValueLabel(config, field, operator, delta, null, isTrueSpecialRange);
      const sepText = operatorDefinition?.textSeparators ? operatorDefinition?.textSeparators[delta] : null;

      let valueLabels = null;
      let textSeparators = null;
      if (isSpecialRange) {
        valueLabels = [
          getValueLabel(config, field, operator, 0),
          getValueLabel(config, field, operator, 1)
        ];
        valueLabels = {
          placeholder: [ valueLabels[0].placeholder, valueLabels[1].placeholder ],
          label: [ valueLabels[0].label, valueLabels[1].label ],
        };
        textSeparators = operatorDefinition?.textSeparators;
      }

      const widgetId = [
        id,
        isLHS ? "L" : "R",
        isLHS ? -1 : (delta || 0),
        (parentFuncs || []).map(([f, a]) => `${f}(${a})`).join("/"),
      ].join(":");
      const vsId = widgetId + ":" + "VS";

      const setValueSrcHandler = this._setValueSrc.bind(this, delta, vsId);
      const setValueHandler = this._setValue.bind(this, isSpecialRange, delta, widgetType, widgetId);

      return {
        valueSrc,
        valueLabel,
        widget,
        sepText,
        widgetDefinition,
        widgetValueLabel,
        valueLabels,
        textSeparators,
        setValueSrcHandler,
        setValueHandler,
        widgetId,
      };
    });
      
    return {
      defaultWidget,
      fieldDefinition,
      operatorDefinition,
      isSpecialRange: isTrueSpecialRange,
      cardinality,
      valueSources,
      widgets,
      iValues, //correct for isFuncArg
      aField: field, //correct for isFuncArg
      asyncListValues,
    };
  }

  renderWidget = (delta, meta, props) => {
    const {
      config, isFuncArg, leftField, operator, value: values, valueError, fieldError,
      readonly, parentField, parentFuncs, id, groupId, fieldSrc, fieldType, isLHS, setFuncValue,
    } = props;
    const {settings} = config;
    const { widgets, iValues, aField, valueSources } = meta;
    const value = isFuncArg ? iValues : values;
    const field = isFuncArg ? leftField : aField;
    const { valueSrc, valueLabel, widgetId } = widgets[delta];
    const hasValueSources = valueSources.length > 1 && !readonly;
    
    const widgetLabel = settings.showLabels
      ? <label className="rule--label">{valueLabel.label}</label>
      : null;
    return (
      <div key={"widget-"+field+"-"+delta} className={classNames(
        valueSrc == "func" ? "widget--func" : "widget--widget",
        hasValueSources ? "widget--has-valuerscs" : "widget--has-no-valuerscs"
      )}>
        {valueSrc == "func" ? null : widgetLabel}
        <WidgetFactory
          id={id} // id of rule
          groupId={groupId}
          widgetId={widgetId}
          valueSrc={valueSrc}
          delta={delta}
          value={value}
          valueError={valueError}
          fieldError={fieldError}
          isFuncArg={isFuncArg}
          isLHS={isLHS}
          {...pick(meta, ["isSpecialRange", "fieldDefinition", "asyncListValues"])}
          {...pick(widgets[delta], [
            "widget", "widgetDefinition", "widgetValueLabel", "valueLabels", "textSeparators", "setValueHandler",
          ])}
          setFuncValue={setFuncValue}
          config={config}
          field={field}
          fieldSrc={fieldSrc}
          fieldType={fieldType}
          parentField={parentField}
          parentFuncs={parentFuncs}
          operator={operator}
          readonly={readonly}
        />
      </div>
    );
  };

  renderValueSources = (delta, meta, props) => {
    const {config, isFuncArg, leftField, operator, readonly} = props;
    const {settings} = config;
    const { valueSources, widgets, aField } = meta;
    const field = isFuncArg ? leftField : aField;
    const {valueSrc, setValueSrcHandler} = widgets[delta];
    const {valueSourcesInfo, renderValueSources} = settings;
    const valueSourcesOptions = valueSources.map(srcKey => [srcKey, {
      label: valueSourcesInfo[srcKey].label
    }]);
    const ValueSources = (pr) => renderValueSources(pr, config.ctx);

    const sourceLabel = settings.showLabels
      ? <label className="rule--label">&nbsp;</label>
      : null;

    return valueSources.length > 1 && !readonly
      && <div key={"valuesrc-"+field+"-"+delta} className="widget--valuesrc">
        {sourceLabel}
        <ValueSources
          key={"valuesrc-"+delta}
          delta={delta}
          valueSources={valueSourcesOptions}
          valueSrc={valueSrc}
          config={config}
          field={field}
          operator={operator}
          setValueSrc={setValueSrcHandler}
          readonly={readonly}
          title={settings.valueSourcesPopupTitle}
        />
      </div>;
  };

  renderSep = (delta, meta, props) => {
    const {config} = props;
    const {widgets} = meta;
    const {settings} = config;
    const {sepText} = widgets[delta];

    const sepLabel = settings.showLabels
      ? <label className="rule--label">&nbsp;</label>
      : null;

    return sepText
      && <div key={"widget-separators-"+delta} className={classNames(
        "widget--sep",
        delta == 0 && "widget--sep-first"
      )} >
        {sepLabel}
        <span>{sepText}</span>
      </div>;
  };

  renderWidgetDelta = (delta) => {
    const sep = this.renderSep(delta, this.meta, this.props);
    const sources = this.renderValueSources(delta, this.meta, this.props);
    const widgetCmp = this.renderWidget(delta, this.meta, this.props);

    return [
      sep,
      sources,
      widgetCmp,
    ];
  };

  render() {
    if (!this.meta) return null;
    const { defaultWidget, cardinality } = this.meta;
    if (!defaultWidget) return null;
    const name = defaultWidget;

    return (
      <Col
        className={`rule--widget rule--widget--${name.toUpperCase()}`}
        key={"widget-col-"+name}
      >
        {range(0, cardinality).map(this.renderWidgetDelta)}
      </Col>
    );
  }

}
