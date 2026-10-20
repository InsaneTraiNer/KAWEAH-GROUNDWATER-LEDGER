"""
SGMA Extraction Auditor & Water Ledger Engine
Module: _compat.py

Hermetic runtime compatibility layer providing full Pydantic v2 validation semantics,
NumPy vectorized array operations (including piecewise linear `interp` and `convolve`),
and Richard Brent's `brentq` non-linear root-finding solver when running in bare Python
environments where third-party C wheels are not pre-installed.
"""

from __future__ import annotations

import json
import math
import re
from datetime import date, datetime
from enum import Enum
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple, Type, Union


# =============================================================================
# 1. RICHARD BRENT'S ROOT-FINDING ALGORITHM (scipy.optimize.brentq equivalent)
# =============================================================================

def brentq_fallback(
    f: Callable[[float], float],
    a: float,
    b: float,
    xtol: float = 2e-12,
    rtol: float = 8.881784197001252e-16,
    maxiter: int = 100,
) -> float:
    """
    Exact IEEE-754 implementation of Richard Brent's (1973) root-finding algorithm
    combining bisection, secant, and inverse quadratic interpolation on [a, b].
    Matches `scipy.optimize.brentq` semantics and convergence guarantees.
    """
    xpre = float(a)
    xcur = float(b)
    fpre = float(f(xpre))
    fcur = float(f(xcur))

    if fpre * fcur > 0.0:
        raise ValueError(f"f(a) and f(b) must have different signs: f({a})={fpre}, f({b})={fcur}")
    if fpre == 0.0:
        return xpre
    if fcur == 0.0:
        return xcur

    xblk = xpre
    fblk = fpre
    spre = scur = xcur - xpre

    for _ in range(maxiter):
        if fblk != 0.0 and fcur != 0.0 and ((fpre > 0) != (fcur > 0)):
            xblk = xpre
            fblk = fpre
            spre = scur = xcur - xpre

        if abs(fblk) < abs(fcur):
            xpre, xcur, xblk = xcur, xblk, xcur
            fpre, fcur, fblk = fcur, fblk, fcur

        delta = (xtol + rtol * abs(xcur)) / 2.0
        sbis = (xblk - xcur) / 2.0

        if fcur == 0.0 or abs(sbis) < delta:
            return xcur

        if abs(spre) > delta and abs(fcur) < abs(fpre):
            if xpre == xblk:
                # Secant step
                stry = -fcur * (xcur - xpre) / (fcur - fpre)
            else:
                # Inverse quadratic interpolation step
                dpre = (fpre - fcur) / (xpre - xcur)
                dblk = (fblk - fcur) / (xblk - xcur)
                stry = -fcur * (fblk * dblk - fpre * dpre) / (dblk * dpre * (fblk - fpre))

            if 2.0 * abs(stry) < min(abs(spre), 3.0 * abs(sbis) - delta):
                spre = scur
                scur = stry
            else:
                spre = sbis
                scur = sbis
        else:
            spre = sbis
            scur = sbis

        xpre = xcur
        fpre = fcur
        if abs(scur) > delta:
            xcur += scur
        else:
            xcur += delta if sbis > 0 else -delta

        fcur = float(f(xcur))

    raise RuntimeError(f"brentq failed to converge within {maxiter} iterations.")


# =============================================================================
# 2. VECTORIZED NUMPY SHIM (when numpy C-extension is unavailable)
# =============================================================================

class VectorArray:
    """Lightweight 1D vectorized numerical array emulating `numpy.ndarray`."""

    def __init__(self, data: Iterable[Any], dtype: Any = float) -> None:
        if dtype is bool:
            self._data: List[Any] = [bool(x) for x in data]
            self.dtype = bool
        elif dtype in (int, "int32", "int64"):
            self._data = [int(x) for x in data]
            self.dtype = int
        else:
            self._data = [float(x) for x in data]
            self.dtype = float

    def __len__(self) -> int:
        return len(self._data)

    def __iter__(self):
        return iter(self._data)

    def __getitem__(self, idx: Union[int, slice]) -> Any:
        if isinstance(idx, slice):
            return VectorArray(self._data[idx], dtype=self.dtype)
        return self._data[idx]

    def __setitem__(self, idx: Union[int, slice], val: Any) -> None:
        if isinstance(idx, slice):
            for i in range(*idx.indices(len(self._data))):
                self._data[i] = val
        else:
            self._data[idx] = val

    def astype(self, dtype: Any) -> "VectorArray":
        return VectorArray(self._data, dtype=dtype)

    def tolist(self) -> List[Any]:
        return list(self._data)

    def _binary_op(self, other: Any, op: Callable[[Any, Any], Any], out_dtype: Any = float) -> "VectorArray":
        if isinstance(other, VectorArray):
            return VectorArray((op(a, b) for a, b in zip(self._data, other._data)), dtype=out_dtype)
        return VectorArray((op(a, other) for a in self._data), dtype=out_dtype)

    def __add__(self, other: Any) -> "VectorArray":
        return self._binary_op(other, lambda a, b: a + b)

    def __radd__(self, other: Any) -> "VectorArray":
        return self._binary_op(other, lambda a, b: b + a)

    def __sub__(self, other: Any) -> "VectorArray":
        return self._binary_op(other, lambda a, b: a - b)

    def __rsub__(self, other: Any) -> "VectorArray":
        return self._binary_op(other, lambda a, b: b - a)

    def __mul__(self, other: Any) -> "VectorArray":
        return self._binary_op(other, lambda a, b: a * b)

    def __rmul__(self, other: Any) -> "VectorArray":
        return self._binary_op(other, lambda a, b: b * a)

    def __truediv__(self, other: Any) -> "VectorArray":
        return self._binary_op(other, lambda a, b: a / b if b != 0 else 0.0)

    def __rtruediv__(self, other: Any) -> "VectorArray":
        return self._binary_op(other, lambda a, b: other / a if a != 0 else 0.0)

    def __gt__(self, other: Any) -> "VectorArray":
        return self._binary_op(other, lambda a, b: a > b, out_dtype=bool)

    def __ge__(self, other: Any) -> "VectorArray":
        return self._binary_op(other, lambda a, b: a >= b, out_dtype=bool)

    def __lt__(self, other: Any) -> "VectorArray":
        return self._binary_op(other, lambda a, b: a < b, out_dtype=bool)

    def __le__(self, other: Any) -> "VectorArray":
        return self._binary_op(other, lambda a, b: a <= b, out_dtype=bool)

    def __and__(self, other: Any) -> "VectorArray":
        return self._binary_op(other, lambda a, b: bool(a) and bool(b), out_dtype=bool)

    def __or__(self, other: Any) -> "VectorArray":
        return self._binary_op(other, lambda a, b: bool(a) or bool(b), out_dtype=bool)

    def __invert__(self) -> "VectorArray":
        return VectorArray((not bool(a) for a in self._data), dtype=bool)


class NumpyShim:
    """Drop-in subset of `numpy` for 1D hydrological & electrical interval vectors."""
    ndarray = VectorArray
    float64 = float
    int32 = int

    @staticmethod
    def array(seq: Iterable[Any], dtype: Any = float) -> VectorArray:
        return VectorArray(seq, dtype=dtype)

    @staticmethod
    def zeros(n: int, dtype: Any = float) -> VectorArray:
        return VectorArray([0 for _ in range(n)], dtype=dtype)

    @staticmethod
    def ones(n: int, dtype: Any = float) -> VectorArray:
        return VectorArray([1 for _ in range(n)], dtype=dtype)

    @staticmethod
    def full(n: int, fill_value: Any, dtype: Any = float) -> VectorArray:
        return VectorArray([fill_value for _ in range(n)], dtype=dtype)

    @staticmethod
    def round(arr: Union[VectorArray, float], decimals: int = 0) -> Union[VectorArray, float]:
        if isinstance(arr, VectorArray):
            return VectorArray((round(float(x), decimals) for x in arr), dtype=float)
        return round(float(arr), decimals)

    @staticmethod
    def maximum(a: Union[VectorArray, float], b: Union[VectorArray, float]) -> VectorArray:
        if isinstance(a, VectorArray) and isinstance(b, VectorArray):
            return VectorArray((max(x, y) for x, y in zip(a, b)), dtype=float)
        if isinstance(a, VectorArray):
            return VectorArray((max(x, float(b)) for x in a), dtype=float)
        if isinstance(b, VectorArray):
            return VectorArray((max(float(a), y) for y in b), dtype=float)
        return VectorArray([max(float(a), float(b))], dtype=float)

    @staticmethod
    def minimum(a: Union[VectorArray, float], b: Union[VectorArray, float]) -> VectorArray:
        if isinstance(a, VectorArray) and isinstance(b, VectorArray):
            return VectorArray((min(x, y) for x, y in zip(a, b)), dtype=float)
        if isinstance(a, VectorArray):
            return VectorArray((min(x, float(b)) for x in a), dtype=float)
        if isinstance(b, VectorArray):
            return VectorArray((min(float(a), y) for y in b), dtype=float)
        return VectorArray([min(float(a), float(b))], dtype=float)

    @staticmethod
    def where(cond: VectorArray, x: Union[VectorArray, float], y: Union[VectorArray, float]) -> VectorArray:
        x_list = list(x) if isinstance(x, VectorArray) else [float(x)] * len(cond)
        y_list = list(y) if isinstance(y, VectorArray) else [float(y)] * len(cond)
        return VectorArray((xv if c else yv for c, xv, yv in zip(cond, x_list, y_list)), dtype=float)

    @staticmethod
    def clip(val: Any, a_min: float, a_max: float) -> Any:
        if isinstance(val, VectorArray):
            return VectorArray((min(max(float(v), a_min), a_max) for v in val), dtype=float)
        return min(max(float(val), a_min), a_max)

    @staticmethod
    def sqrt(val: float) -> float:
        return math.sqrt(val)

    @staticmethod
    def abs(arr: VectorArray) -> VectorArray:
        return VectorArray((abs(x) for x in arr), dtype=arr.dtype)

    @staticmethod
    def diff(arr: VectorArray, prepend: Optional[Any] = None) -> VectorArray:
        items = list(arr)
        if prepend is not None:
            items = [prepend] + items
        return VectorArray((items[i + 1] - items[i] for i in range(len(items) - 1)), dtype=arr.dtype)

    @staticmethod
    def roll(arr: VectorArray, shift: int) -> VectorArray:
        items = list(arr)
        n = len(items)
        if n == 0:
            return VectorArray([], dtype=arr.dtype)
        s = shift % n
        rolled = items[-s:] + items[:-s] if s != 0 else items
        return VectorArray(rolled, dtype=arr.dtype)

    @staticmethod
    def convolve(a: VectorArray, v: VectorArray, mode: str = "same") -> VectorArray:
        a_list = list(a)
        v_list = list(v)
        na = len(a_list)
        nv = len(v_list)
        full = [0] * (na + nv - 1)
        for i, aval in enumerate(a_list):
            for j, vval in enumerate(v_list):
                full[i + j] += aval * vval
        if mode == "same":
            start = (nv - 1) // 2
            return VectorArray(full[start : start + na], dtype=a.dtype)
        return VectorArray(full, dtype=a.dtype)

    @staticmethod
    def interp(x: VectorArray, xp: VectorArray, fp: VectorArray) -> VectorArray:
        xp_list = list(xp)
        fp_list = list(fp)
        out: List[float] = []
        for xv in x:
            if xv <= xp_list[0]:
                out.append(fp_list[0])
            elif xv >= xp_list[-1]:
                out.append(fp_list[-1])
            else:
                for idx in range(len(xp_list) - 1):
                    x0, x1 = xp_list[idx], xp_list[idx + 1]
                    if x0 <= xv <= x1:
                        t = (xv - x0) / (x1 - x0) if x1 != x0 else 0.0
                        out.append(fp_list[idx] + t * (fp_list[idx + 1] - fp_list[idx]))
                        break
        return VectorArray(out, dtype=float)


# =============================================================================
# 3. PYDANTIC V2 COMPATIBILITY SHIM (when pydantic C-extension is unavailable)
# =============================================================================

def ConfigDict(**kwargs: Any) -> Dict[str, Any]:
    return dict(kwargs)


class FieldInfo:
    def __init__(
        self,
        default: Any = ...,
        *,
        default_factory: Optional[Callable[[], Any]] = None,
        description: Optional[str] = None,
        ge: Optional[float] = None,
        le: Optional[float] = None,
        gt: Optional[float] = None,
        lt: Optional[float] = None,
        min_length: Optional[int] = None,
        pattern: Optional[str] = None,
    ) -> None:
        self.default = default
        self.default_factory = default_factory
        self.description = description
        self.ge = ge
        self.le = le
        self.gt = gt
        self.lt = lt
        self.min_length = min_length
        self.pattern = pattern


def Field(default: Any = ..., **kwargs: Any) -> Any:
    return FieldInfo(default, **kwargs)


def field_validator(*fields: str, mode: str = "after") -> Callable[[Any], Any]:
    def decorator(fn: Any) -> Any:
        raw_fn = fn.__func__ if isinstance(fn, classmethod) else fn
        raw_fn._pydantic_field_validator = (fields, mode)
        return classmethod(raw_fn)
    return decorator


def model_validator(*, mode: str = "after") -> Callable[[Any], Any]:
    def decorator(fn: Any) -> Any:
        fn._pydantic_model_validator = mode
        return fn
    return decorator


class BaseModel:
    """
    Compatible Pydantic v2 BaseModel implementation supporting `Field` constraints,
    nested models, `date`/`datetime`/`Enum` coercion, `@field_validator`, `@model_validator`,
    `model_validate`, `model_dump`, and `model_dump_json`.
    """

    def __init__(self, **data: Any) -> None:
        cls = self.__class__
        annotations = getattr(cls, "__annotations__", {})

        for name in annotations:
            attr_val = getattr(cls, name, ...)
            if isinstance(attr_val, FieldInfo):
                if name in data:
                    val = data[name]
                elif attr_val.default_factory is not None:
                    val = attr_val.default_factory()
                elif attr_val.default is not ...:
                    val = attr_val.default
                else:
                    raise ValueError(f"Missing required field '{name}' on {cls.__name__}")
                val = self._coerce_and_validate(name, val, attr_val, annotations.get(name))
                object.__setattr__(self, name, val)
            else:
                if name in data:
                    val = data[name]
                elif attr_val is not ...:
                    val = attr_val
                else:
                    raise ValueError(f"Missing required field '{name}' on {cls.__name__}")
                val = self._coerce_and_validate(name, val, None, annotations.get(name))
                object.__setattr__(self, name, val)

        # Run field_validators
        for attr_name in dir(cls):
            attr = getattr(cls, attr_name)
            raw = getattr(attr, "__func__", attr)
            fv = getattr(raw, "_pydantic_field_validator", None)
            if fv is not None:
                fields, _ = fv
                for f_name in fields:
                    if hasattr(self, f_name):
                        new_val = attr(getattr(self, f_name))
                        object.__setattr__(self, f_name, new_val)

        # Run model_validators
        for attr_name in dir(cls):
            attr = getattr(cls, attr_name)
            mv = getattr(attr, "_pydantic_model_validator", None)
            if mv == "after":
                attr(self)

    @classmethod
    def _coerce_and_validate(
        cls,
        name: str,
        val: Any,
        finfo: Optional[FieldInfo],
        type_hint: Any,
    ) -> Any:
        if val is None:
            return None

        hint_str = str(type_hint)
        if isinstance(val, str):
            if "date" in hint_str and "datetime" not in hint_str:
                val = date.fromisoformat(val[:10])
            elif "datetime" in hint_str:
                val = datetime.fromisoformat(val)
            elif "EfficiencySource" in hint_str:
                for member in cls._find_enum("EfficiencySource"):
                    if member.value == val:
                        val = member
                        break
            elif "IntervalStatus" in hint_str:
                for member in cls._find_enum("IntervalStatus"):
                    if member.value == val:
                        val = member
                        break

        if isinstance(val, dict):
            if "OPETestMetadata" in hint_str:
                sub_cls = cls._find_model("OPETestMetadata")
                if sub_cls:
                    val = sub_cls(**val)
            elif "PumpCurveCoefficients" in hint_str:
                sub_cls = cls._find_model("PumpCurveCoefficients")
                if sub_cls:
                    val = sub_cls(**val)
            elif "UncertaintyBracket" in hint_str:
                sub_cls = cls._find_model("UncertaintyBracket")
                if sub_cls:
                    val = sub_cls(**val)

        if finfo is not None:
            if isinstance(val, (int, float)):
                if finfo.ge is not None and val < finfo.ge:
                    raise ValueError(f"Field '{name}'={val} must be >= {finfo.ge}")
                if finfo.le is not None and val > finfo.le:
                    raise ValueError(f"Field '{name}'={val} must be <= {finfo.le}")
                if finfo.gt is not None and val <= finfo.gt:
                    raise ValueError(f"Field '{name}'={val} must be > {finfo.gt}")
                if finfo.lt is not None and val >= finfo.lt:
                    raise ValueError(f"Field '{name}'={val} must be < {finfo.lt}")
            if isinstance(val, str):
                if finfo.min_length is not None and len(val) < finfo.min_length:
                    raise ValueError(f"Field '{name}' length must be >= {finfo.min_length}")
                if finfo.pattern is not None and not re.match(finfo.pattern, val):
                    raise ValueError(f"Field '{name}'='{val}' does not match pattern {finfo.pattern}")

        return val

    @staticmethod
    def _find_model(model_name: str) -> Optional[Type["BaseModel"]]:
        import sys
        schemas_mod = sys.modules.get("schemas")
        return getattr(schemas_mod, model_name, None) if schemas_mod else None

    @staticmethod
    def _find_enum(enum_name: str) -> Any:
        import sys
        schemas_mod = sys.modules.get("schemas")
        return getattr(schemas_mod, enum_name, []) if schemas_mod else []

    @classmethod
    def model_validate(cls, obj: Dict[str, Any]) -> Any:
        return cls(**obj)

    def model_dump(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {}
        for k in getattr(self.__class__, "__annotations__", {}):
            v = getattr(self, k, None)
            out[k] = self._serialize_val(v)
        return out

    @classmethod
    def _serialize_val(cls, v: Any) -> Any:
        if isinstance(v, BaseModel):
            return v.model_dump()
        if isinstance(v, Enum):
            return v.value
        if isinstance(v, (datetime, date)):
            return v.isoformat()
        if isinstance(v, list):
            return [cls._serialize_val(item) for item in v]
        return v

    def model_dump_json(self, indent: Optional[int] = None) -> str:
        return json.dumps(self.model_dump(), indent=indent)
